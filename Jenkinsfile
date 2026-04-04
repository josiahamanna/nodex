// Release deploy: checkout → optional npm ci (ignore-scripts) → docker full deploy.
// Prerequisites: deploy/jenkins/README.md (Docker, Node 22 or NVM, bash).

pipeline {
    agent any

    options {
        timestamps()
    }

    parameters {
        booleanParam(
            name: 'RUN_NPM_CI',
            defaultValue: false,
            description: 'Run npm ci --ignore-scripts before deploy (optional; avoids Electron postinstall on the agent)'
        )
    }

    environment {
        // Fixed project name so fixed container_name values (e.g. nodex-postgres) are not duplicated
        // when Jenkins WORKSPACE basename differs between jobs or multibranch branches.
        COMPOSE_PROJECT_NAME = 'nodex'
        // Uncomment after creating credentials (see deploy/jenkins/README.md):
        // NODEX_AUTH_JWT_SECRET = credentials('nodex-auth-jwt-secret')
        // NODEX_PG_PASSWORD = credentials('nodex-pg-password')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            when {
                expression { return params.RUN_NPM_CI }
            }
            steps {
                sh 'bash scripts/jenkins-with-node22.sh npm ci --ignore-scripts'
            }
        }

        stage('Deploy') {
            steps {
                sh 'bash scripts/jenkins-with-node22.sh npm run deploy -- --stop-old'
            }
        }

        // Same agent as Deploy — confirms Docker on Jenkins actually has the stack (no SSH needed).
        stage('Verify') {
            steps {
                sh '''#!/usr/bin/env bash
set -euo pipefail
: "${NODEX_GATEWAY_PORT:=8080}"
echo "=== Nodex containers on this Jenkins agent ==="
docker ps -a --filter name=nodex --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
if ! docker container inspect nodex-gateway &>/dev/null; then
  echo "ERROR: nodex-gateway not found on this agent. Deploy should create it (see scripts/docker-full-deploy.sh)." >&2
  exit 1
fi
if [[ "$(docker container inspect -f '{{.State.Running}}' nodex-gateway 2>/dev/null)" != "true" ]]; then
  echo "ERROR: nodex-gateway is not running." >&2
  docker logs --tail 80 nodex-gateway 2>&1 || true
  exit 1
fi
if ! docker port nodex-gateway 80 &>/dev/null; then
  echo "ERROR: nodex-gateway has no host port mapping for container :80." >&2
  exit 1
fi
echo "Gateway port mapping:"
docker port nodex-gateway 80
echo "Verify OK: nodex-gateway is up (open the URL on the agent host, e.g. http://127.0.0.1:${NODEX_GATEWAY_PORT}/)."
'''
            }
        }
    }
}
