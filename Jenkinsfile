// Release deploy: checkout → optional npm ci → full or targeted Docker deploy.
// Prerequisites: deploy/jenkins/README.md (Docker, Node 22 or NVM, bash).
//
// FULL_DEPLOY runs scripts/docker-full-deploy.sh (mongo-sync + sync-api + gateway + web blue/green).
// Targeted stages run in order: API → gateway → web (deploy:web-only).
// Cold / first-time: prefer FULL_DEPLOY, or enable all targets. Gateway-only can fail if
// deploy/nginx-active-web.upstream.conf points at a missing web container (see deploy/jenkins/README.md).

pipeline {
    agent any

    options {
        timestamps()
    }

    parameters {
        booleanParam(
            name: 'FULL_DEPLOY',
            defaultValue: true,
            description: 'Run full stack deploy (npm run deploy -- --stop-old). When enabled, the four checkboxes below are ignored.'
        )
        booleanParam(
            name: 'DEPLOY_API',
            defaultValue: false,
            description: 'Rebuild/restart mongo-sync + nodex-sync-api'
        )
        booleanParam(
            name: 'DEPLOY_GATEWAY',
            defaultValue: false,
            description: 'Rebuild/restart nodex-gateway (--no-deps). Requires sync-api + web upstream resolvable (see nginx-active-web.upstream.conf)'
        )
        booleanParam(
            name: 'DEPLOY_WEB',
            defaultValue: false,
            description: 'Frontend blue/green only (npm run deploy:web-only). Requires gateway and compose network already up'
        )
        booleanParam(
            name: 'RUN_NPM_CI',
            defaultValue: false,
            description: 'Run npm ci --ignore-scripts before deploy (optional; avoids Electron postinstall on the agent)'
        )
    }

    environment {
        // Fixed project name so fixed container_name values are not duplicated
        // when Jenkins WORKSPACE basename differs between jobs or multibranch branches.
        COMPOSE_PROJECT_NAME = 'nodex'
        // Uncomment after creating credentials (see deploy/jenkins/README.md):
        // JWT_SECRET = credentials('nodex-jwt-secret')
        // Legacy headless only: NODEX_AUTH_JWT_SECRET = credentials('nodex-auth-jwt-secret')
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

        stage('Validate deploy selection') {
            when {
                expression { return !params.FULL_DEPLOY }
            }
            steps {
                script {
                    def any = params.DEPLOY_API || params.DEPLOY_GATEWAY || params.DEPLOY_WEB
                    if (!any) {
                        error('Uncheck FULL_DEPLOY only when at least one of DEPLOY_API, DEPLOY_GATEWAY, DEPLOY_WEB is enabled.')
                    }
                }
            }
        }

        stage('Deploy (full stack)') {
            when {
                expression { return params.FULL_DEPLOY }
            }
            steps {
                sh 'bash scripts/jenkins-with-node22.sh npm run deploy -- --stop-old'
            }
        }

        stage('Deploy API') {
            when {
                allOf {
                    expression { return !params.FULL_DEPLOY }
                    expression { return params.DEPLOY_API }
                }
            }
            steps {
                sh '''#!/usr/bin/env bash
set -euo pipefail
docker compose --profile local-mongo up -d --build --remove-orphans mongo-sync nodex-sync-api
'''
            }
        }

        stage('Deploy gateway') {
            when {
                allOf {
                    expression { return !params.FULL_DEPLOY }
                    expression { return params.DEPLOY_GATEWAY }
                }
            }
            steps {
                sh '''#!/usr/bin/env bash
set -euo pipefail
docker compose up -d --build --remove-orphans --no-deps nodex-gateway
'''
            }
        }

        stage('Deploy web (blue/green)') {
            when {
                allOf {
                    expression { return !params.FULL_DEPLOY }
                    expression { return params.DEPLOY_WEB }
                }
            }
            steps {
                sh 'bash scripts/jenkins-with-node22.sh npm run deploy:web-only -- --stop-old'
            }
        }

        // Same agent as deploy — confirms Docker on Jenkins actually has the stack (no SSH needed).
        stage('Verify') {
            when {
                expression {
                    return params.FULL_DEPLOY || params.DEPLOY_GATEWAY || params.DEPLOY_WEB
                }
            }
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
if ! docker exec nodex-gateway nginx -t 2>&1; then
  echo "ERROR: nginx -t failed inside nodex-gateway (see logs above)." >&2
  exit 1
fi
echo "Verify OK: nodex-gateway is up (open the URL on the agent host, e.g. http://127.0.0.1:${NODEX_GATEWAY_PORT}/)."
'''
            }
        }
    }
}
