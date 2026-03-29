# Modux Codebase Rules (STRICT)

These rules are mandatory. Cursor must enforce them during generation, refactoring, and suggestions.

---

## 1. Architecture Rules

### 1.1 Single Responsibility Principle (SRP)
- Each file/module must have ONE responsibility.
- If a module does more than one logical task → split it.

### 1.2 Explicit Dependencies Only
- No hidden/global dependencies.
- All dependencies must be explicitly imported.

### 1.3 Dependency Direction
- High-level modules MUST NOT depend on low-level implementations.
- Use interfaces/contracts instead.

---


## 5. State Management Rules

### 5.1 Single Source of Truth
- State must exist in only one place

### 5.2 Controlled Mutation
- No direct mutation across modules

---

## 6. Error Handling Rules

### 6.1 No Silent Failures
- Always log errors

---

## 7. Type Safety Rules

### 7.1 No `any`
- `any` is forbidden unless justified

### 7.2 Strict Typing
- All public APIs must have explicit types

---

## 8. Testing Rules

### 8.1 Isolation
- Each module must be testable independently

### 8.2 Plugin Testing
- Plugins must mock core APIs

---

## 9. Anti-Patterns (STRICTLY FORBIDDEN)

- God classes
- Circular dependencies
- Deep imports
- Shared mutable state
- Plugin-to-plugin coupling

---

## 10. Cursor Behavior Rules

Cursor MUST:
- Split large files into modules
- Extract interfaces before implementation
- Enforce public API boundaries
- Remove hidden dependencies
- Prefer composition over inheritance

---

## 11. Refactoring Triggers

Refactor when:
- File > 300 lines
- Function > 40 lines
- Multiple responsibilities detected

---

## 12. Golden Rule

If a module cannot be removed without breaking unrelated parts, it is too coupled.