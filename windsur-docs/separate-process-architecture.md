# Separate Node.js Process Architecture for Plugins

## Overview

This document details the architecture for running backend plugins in **separate Node.js processes** instead of worker threads, providing complete isolation and matching VS Code's extension host model.

---

## Architecture Comparison

### Worker Threads (Previous)

```
Main Process
  └── Worker Thread Pool
      ├── Plugin A (shared memory space)
      ├── Plugin B (shared memory space)
      └── Plugin C (shared memory space)
```

### Separate Processes (Current)

```
Main Process (Plugin Loader)
  │
  ├─── Plugin Process A (isolated V8 instance)
  ├─── Plugin Process B (isolated V8 instance)
  └─── Plugin Process C (isolated V8 instance)
```

---

## Benefits of Separate Processes

### 1. **Complete Isolation**
- ✅ Each plugin has its own V8 instance
- ✅ Plugin crash doesn't affect main app or other plugins
- ✅ Memory leaks contained to single plugin
- ✅ OS-level process isolation

### 2. **Security**
- ✅ True sandboxing at OS level
- ✅ Can use OS permissions (chroot, seccomp, etc.)
- ✅ Resource limits enforced by OS (CPU, memory)
- ✅ No shared memory vulnerabilities

### 3. **Resource Management**
- ✅ Set CPU limits per plugin
- ✅ Set memory limits per plugin
- ✅ Monitor resource usage per plugin
- ✅ Kill runaway plugins without affecting others

### 4. **Debugging**
- ✅ Each plugin can have its own debugger port
- ✅ Easier to profile individual plugins
- ✅ Clear process boundaries in system monitor

### 5. **Matches VS Code**
- ✅ Same architecture as VS Code extension host
- ✅ Proven at scale (thousands of extensions)
- ✅ Well-documented patterns

---

## Implementation Details

### Plugin Process Lifecycle

```typescript
// Main Process - Plugin Loader
class PluginProcessManager {
  private processes: Map<string, ChildProcess> = new Map();
  
  async startPlugin(pluginId: string, pluginPath: string) {
    // Spawn separate Node.js process
    const child = fork(
      path.join(__dirname, 'plugin-host.js'),
      [pluginId, pluginPath],
      {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          PLUGIN_ID: pluginId,
          PLUGIN_PATH: pluginPath
        },
        // Resource limits (Linux)
        execArgv: [
          '--max-old-space-size=512',  // 512MB memory limit
          '--max-semi-space-size=2'     // GC settings
        ]
      }
    );
    
    // Setup IPC communication
    child.on('message', (msg) => this.handleMessage(pluginId, msg));
    child.on('error', (err) => this.handleError(pluginId, err));
    child.on('exit', (code) => this.handleExit(pluginId, code));
    
    // Store process reference
    this.processes.set(pluginId, child);
    
    // Send initialization message
    child.send({
      type: 'init',
      config: await this.getPluginConfig(pluginId)
    });
  }
  
  async stopPlugin(pluginId: string) {
    const child = this.processes.get(pluginId);
    if (!child) return;
    
    // Graceful shutdown
    child.send({ type: 'shutdown' });
    
    // Force kill after timeout
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 5000);
    
    this.processes.delete(pluginId);
  }
  
  sendToPlugin(pluginId: string, message: any) {
    const child = this.processes.get(pluginId);
    if (child && !child.killed) {
      child.send(message);
    }
  }
}
```

### Plugin Host (Runs in Separate Process)

```javascript
// plugin-host.js - Runs in separate Node.js process
const pluginId = process.env.PLUGIN_ID;
const pluginPath = process.env.PLUGIN_PATH;

// Load plugin
const plugin = require(path.join(pluginPath, 'main.js'));

// Create sandboxed API
const api = createPluginAPI(pluginId);

// Setup IPC listener
process.on('message', async (msg) => {
  switch (msg.type) {
    case 'init':
      // Initialize plugin
      await plugin.activate(msg.config, api);
      process.send({ type: 'ready' });
      break;
      
    case 'shutdown':
      // Cleanup
      if (plugin.deactivate) {
        await plugin.deactivate();
      }
      process.exit(0);
      break;
      
    case 'request':
      // Handle API request
      const result = await handleRequest(msg.payload);
      process.send({
        type: 'response',
        requestId: msg.requestId,
        result
      });
      break;
  }
});

// Sandboxed API implementation
function createPluginAPI(pluginId) {
  return {
    db: {
      query: async (sql, params) => {
        // Send IPC request to main process
        return await sendIPC('db.query', { sql, params });
      },
      // ... other db methods
    },
    
    fs: {
      readFile: async (filePath) => {
        // Validate path is within plugin directory
        const safePath = validatePath(pluginPath, filePath);
        return await sendIPC('fs.readFile', { path: safePath });
      },
      // ... other fs methods
    },
    
    events: {
      on: (event, callback) => {
        // Register event listener
        eventListeners.set(event, callback);
      }
    }
  };
}

// IPC helper
async function sendIPC(method, params) {
  return new Promise((resolve, reject) => {
    const requestId = generateId();
    
    // Store pending request
    pendingRequests.set(requestId, { resolve, reject });
    
    // Send to main process
    process.send({
      type: 'request',
      requestId,
      method,
      params
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}
```

---

## IPC Communication Pattern

### Message Flow

```
Plugin Process                Main Process              Renderer Process
     │                             │                          │
     │  1. Request DB query        │                          │
     ├────────────────────────────>│                          │
     │                             │                          │
     │                             │  2. Validate permissions │
     │                             │  3. Execute query        │
     │                             │                          │
     │  4. Return result           │                          │
     │<────────────────────────────┤                          │
     │                             │                          │
     │  5. Send to frontend        │                          │
     ├────────────────────────────>│                          │
     │                             │  6. Route to renderer    │
     │                             ├─────────────────────────>│
     │                             │                          │
     │                             │  7. User interaction     │
     │                             │<─────────────────────────┤
     │                             │                          │
     │  8. Forward to plugin       │                          │
     │<────────────────────────────┤                          │
```

### Message Types

```typescript
// Plugin → Main Process
type PluginToMainMessage =
  | { type: 'ready' }
  | { type: 'request'; requestId: string; method: string; params: any }
  | { type: 'sendToFrontend'; noteId: string; message: any }
  | { type: 'log'; level: string; message: string };

// Main Process → Plugin
type MainToPluginMessage =
  | { type: 'init'; config: PluginConfig }
  | { type: 'shutdown' }
  | { type: 'response'; requestId: string; result: any }
  | { type: 'event'; event: string; data: any }
  | { type: 'fromFrontend'; noteId: string; message: any };
```

---

## Resource Limits

### Memory Limits

```javascript
// Set V8 heap size limit
const child = fork('plugin-host.js', [], {
  execArgv: [
    '--max-old-space-size=512',  // 512MB max heap
    '--max-semi-space-size=2'     // 2MB semi-space
  ]
});
```

### CPU Limits (Linux)

```javascript
// Use cgroups for CPU limiting
const { spawn } = require('child_process');

// Create cgroup
exec(`cgcreate -g cpu:/plugin-${pluginId}`);
exec(`cgset -r cpu.cfs_quota_us=50000 plugin-${pluginId}`);  // 50% CPU

// Run plugin in cgroup
const child = spawn('cgexec', [
  '-g', `cpu:plugin-${pluginId}`,
  'node', 'plugin-host.js'
]);
```

### Timeout Protection

```javascript
class PluginProcessManager {
  async executeWithTimeout(pluginId: string, fn: Function, timeout = 30000) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Plugin timeout')), timeout)
      )
    ]);
  }
}
```

---

## Error Handling

### Plugin Crash Recovery

```javascript
class PluginProcessManager {
  handleExit(pluginId: string, code: number) {
    console.error(`Plugin ${pluginId} exited with code ${code}`);
    
    // Remove from active plugins
    this.processes.delete(pluginId);
    
    // Notify renderer
    this.notifyRenderer({
      type: 'plugin:crashed',
      pluginId,
      code
    });
    
    // Optional: Auto-restart
    if (this.shouldRestart(pluginId)) {
      setTimeout(() => {
        this.startPlugin(pluginId, this.getPluginPath(pluginId));
      }, 5000);
    }
  }
  
  handleError(pluginId: string, error: Error) {
    console.error(`Plugin ${pluginId} error:`, error);
    
    // Log to plugin-specific log file
    this.logError(pluginId, error);
    
    // Don't crash main process
  }
}
```

---

## Security Enhancements

### Sandboxing (Linux)

```javascript
// Use seccomp to restrict syscalls
const child = fork('plugin-host.js', [], {
  env: {
    ...process.env,
    SECCOMP_FILTER: 'strict'  // Enable strict seccomp
  }
});

// In plugin-host.js
if (process.env.SECCOMP_FILTER === 'strict') {
  // Apply seccomp filter
  const seccomp = require('seccomp');
  seccomp.init(seccomp.SCMP_ACT_ALLOW);
  
  // Deny dangerous syscalls
  seccomp.rule_add(seccomp.SCMP_ACT_KILL, seccomp.SYS_ptrace);
  seccomp.rule_add(seccomp.SCMP_ACT_KILL, seccomp.SYS_execve);
  seccomp.load();
}
```

### File System Isolation

```javascript
// Chroot plugin to its directory (requires root)
function chrootPlugin(pluginPath) {
  process.chroot(pluginPath);
  process.chdir('/');
}

// Or use path validation
function validatePath(pluginDir, requestedPath) {
  const resolved = path.resolve(pluginDir, requestedPath);
  
  if (!resolved.startsWith(pluginDir)) {
    throw new Error('Path outside plugin directory');
  }
  
  return resolved;
}
```

---

## Performance Considerations

### Process Pooling

```javascript
class PluginProcessPool {
  private pool: ChildProcess[] = [];
  private maxSize = 5;
  
  async getProcess(): Promise<ChildProcess> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    
    // Create new process
    return fork('plugin-host.js');
  }
  
  releaseProcess(child: ChildProcess) {
    if (this.pool.length < this.maxSize) {
      // Reset process state
      child.send({ type: 'reset' });
      this.pool.push(child);
    } else {
      child.kill();
    }
  }
}
```

### Lazy Loading

```javascript
class PluginProcessManager {
  async loadPlugin(pluginId: string) {
    // Don't start process until plugin is actually needed
    if (!this.processes.has(pluginId)) {
      await this.startPlugin(pluginId, this.getPluginPath(pluginId));
    }
  }
  
  async unloadPlugin(pluginId: string) {
    // Stop process when plugin is no longer needed
    await this.stopPlugin(pluginId);
  }
}
```

---

## Monitoring & Debugging

### Process Monitoring

```javascript
class PluginMonitor {
  getStats(pluginId: string) {
    const child = this.processes.get(pluginId);
    if (!child) return null;
    
    return {
      pid: child.pid,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime()
    };
  }
  
  getAllStats() {
    return Array.from(this.processes.entries()).map(([id, child]) => ({
      pluginId: id,
      ...this.getStats(id)
    }));
  }
}
```

### Debug Mode

```javascript
// Start plugin with debugger
const child = fork('plugin-host.js', [], {
  execArgv: [
    `--inspect=${9229 + pluginIndex}`,  // Unique debug port per plugin
    '--inspect-brk'  // Break on start
  ]
});

console.log(`Plugin ${pluginId} debugger listening on port ${9229 + pluginIndex}`);
```

---

## Migration from Worker Threads

### Code Changes Required

**Before (Worker Thread):**
```javascript
const { Worker } = require('worker_threads');

const worker = new Worker('./plugin.js', {
  workerData: { pluginId, config }
});

worker.on('message', handleMessage);
```

**After (Separate Process):**
```javascript
const { fork } = require('child_process');

const child = fork('./plugin-host.js', [pluginId], {
  env: { PLUGIN_ID: pluginId }
});

child.on('message', handleMessage);
```

### API Compatibility

The plugin API remains the same - plugins don't need to change their code. Only the plugin loader implementation changes.

---

## Conclusion

Using separate Node.js processes for backend plugins provides:

✅ **Complete isolation** - Plugin crashes don't affect the app  
✅ **Better security** - OS-level sandboxing  
✅ **Resource control** - Per-plugin CPU/memory limits  
✅ **Easier debugging** - Separate debugger per plugin  
✅ **Matches VS Code** - Proven architecture at scale  

The trade-off is slightly higher memory overhead, but the benefits far outweigh the costs for a production system.
