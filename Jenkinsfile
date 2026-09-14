// Save as Jenkinsfile at repository root, branch main.
// Credentials: oral-ai-github is selected in the job SCM; oral-ai-env is a Secret file.
// Only web/backend are built. Desktop packaging is deliberately excluded.
pipeline {
    agent { label 'docker' }
    options {
        timestamps()
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.ORAL_TAG = env.BUILD_TAG.toLowerCase().replaceAll('[^a-z0-9_.-]', '-').take(100)
                    env.ORAL_API_IMAGE = "oral-assessment-api:${env.ORAL_TAG}"
                    env.ORAL_WEB_IMAGE = "oral-assessment-web:${env.ORAL_TAG}"
                    env.ORAL_WEB_CHECK_IMAGE = "oral-assessment-web-check:${env.ORAL_TAG}"
                    env.ORAL_TEST_CONTAINER = "${env.ORAL_TAG}-tests"
                }
            }
        }
        stage('Preflight') {
            steps {
                sh '''set -eu
python3 --version
docker compose version
docker info --format '{{.ServerVersion}}'
docker network inspect nginx-network --format '{{.Name}}'
test -f docker-compose.yml
test -f apps/admin-web/Dockerfile
test -f services/api/Dockerfile
# Never include an accidental real env file in the backend build context.
test ! -f services/api/.env
'''
            }
        }
        stage('Build API') {
            steps {
                sh 'docker build -t "$ORAL_API_IMAGE" services/api'
            }
        }
        stage('Test API - isolated SQLite') {
            steps {
                sh '''set -eu
docker create --name "$ORAL_TEST_CONTAINER" --network none -e PYTHONPATH=/app "$ORAL_API_IMAGE" python -m pytest tests -q -p no:cacheprovider --junitxml=/tmp/oral-results.xml
docker cp services/api/tests "$ORAL_TEST_CONTAINER:/app/tests"
'''
                script {
                    int testStatus = sh(script: 'docker start -a "$ORAL_TEST_CONTAINER"', returnStatus: true)
                    sh 'docker cp "$ORAL_TEST_CONTAINER:/tmp/oral-results.xml" oral-test-results.xml'
                    if (testStatus != 0) { error('API tests failed; deployment skipped') }
                }
            }
        }
        stage('Build and check web') {
            steps {
                sh '''set -eu
docker build --target build -t "$ORAL_WEB_CHECK_IMAGE" -f apps/admin-web/Dockerfile .
docker run --rm --network none "$ORAL_WEB_CHECK_IMAGE" sh -c 'npm run lint --workspace apps/admin-web && npm run typecheck --workspace apps/admin-web'
docker build -t "$ORAL_WEB_IMAGE" -f apps/admin-web/Dockerfile .
'''
            }
        }
        stage('Deploy Oral web') {
            steps {
                withCredentials([file(credentialsId: 'oral-ai-env', variable: 'ORAL_ENV_FILE')]) {
                    sh '''set +x
set -eu
python3 - <<\'ORAL_DEPLOY_PY\'

import datetime
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import quote

PROJECT = \'oral-assessment-web\'
ORIGIN = \'https://oral-test.paperlens.uk\'
NETWORK = \'nginx-network\'
WEB_PORT, CONSOLE_PORT = \'13000\', \'19001\'

def abort(message):
    raise SystemExit(message)

def command(args, env, label):
    result = subprocess.run(args, env=env, text=True, capture_output=True)
    if result.returncode:
        abort(label + \' failed. Output hidden because it may contain credentials. No volumes deleted.\')
    return result.stdout

def enabled(value):
    return str(value).lower() in (\'1\', \'true\', \'yes\', \'on\')

def configure(config, api_image, web_image):
    services = config[\'services\']
    expected = {\'web\', \'api\', \'worker\', \'migrate\', \'postgres\', \'redis\', \'minio\'}
    if set(services) != expected:
        abort(\'Compose services differ from the reviewed web deployment. Review the new source first.\')
    env = services[\'api\'].get(\'environment\', {})
    for name, minimum in [(\'JWT_SECRET\', 32), (\'BOOTSTRAP_PASSWORD\', 12),
                          (\'POSTGRES_PASSWORD\', 12), (\'MINIO_ROOT_PASSWORD\', 8)]:
        value = str(env.get(name) or \'\')
        if len(value) < minimum or \'replace-with-\' in value:
            abort(name + \' is missing, too short, or still a placeholder in oral-ai-env.\')
    for name in (\'PUBLIC_ORIGIN\', \'ALLOWED_ORIGINS\'):
        if env.get(name) != ORIGIN:
            abort(name + \' must equal \' + ORIGIN + \' in oral-ai-env.\')
    if not enabled(env.get(\'COOKIE_SECURE\')):
        abort(\'Set COOKIE_SECURE=true in oral-ai-env.\')
    if env.get(\'AI_PROVIDER\', \'demo\') not in (\'demo\', \'gemini\'):
        abort(\'AI_PROVIDER must be demo or gemini.\')
    if env.get(\'AI_PROVIDER\') == \'gemini\' and not env.get(\'GEMINI_API_KEY\'):
        abort(\'GEMINI_API_KEY is required when AI_PROVIDER=gemini.\')
    if enabled(env.get(\'GOOGLE_LOGIN_ENABLED\')) and not (env.get(\'GOOGLE_CLIENT_ID\') and env.get(\'GOOGLE_CLIENT_SECRET\')):
        abort(\'Google login is enabled but its Client ID/Secret is incomplete.\')
    if env.get(\'GOOGLE_STT_CREDENTIALS_FILE\') or env.get(\'GOOGLE_STT_CREDENTIALS_HOST_FILE\'):
        abort(\'For this pipeline, leave Google STT path variables empty and upload JSON in the admin UI.\')
    for svc, port, target in [(\'web\', WEB_PORT, 3000), (\'minio\', CONSOLE_PORT, 9001)]:
        ports = services[svc].get(\'ports\', [])
        if len(ports) != 1 or str(ports[0].get(\'published\')) != port or ports[0].get(\'host_ip\') != \'127.0.0.1\' or int(ports[0][\'target\']) != target:
            abort(\'Set WEB_BIND=127.0.0.1, WEB_PORT=13000 and MINIO_CONSOLE_PORT=19001 in oral-ai-env.\')
    for svc in expected - {\'web\', \'minio\'}:
        if services[svc].get(\'ports\'):
            abort(\'Backend services must not publish host ports in this deployment.\')
    # Make the project/volume names independent of any temporary directory.
    config[\'name\'] = PROJECT
    config[\'networks\'] = {
        \'default\': {\'name\': PROJECT + \'_default\'},
        \'proxy\': {\'name\': NETWORK, \'external\': True},
    }
    allowed_volumes = {\'postgres_data\', \'redis_data\', \'minio_data\', \'app_data\'}
    if set(config.get(\'volumes\', {})) != allowed_volumes:
        abort(\'Unexpected volume definitions; review source before deployment.\')
    config[\'volumes\'] = {name: {\'name\': PROJECT + \'_\' + name} for name in allowed_volumes}
    pg = services[\'postgres\'][\'environment\']
    db_url = (\'postgresql+psycopg://\' + quote(pg[\'POSTGRES_USER\'], safe=\'\') + \':\'
              + quote(pg[\'POSTGRES_PASSWORD\'], safe=\'\') + \'@postgres:5432/\'
              + quote(pg[\'POSTGRES_DB\'], safe=\'\'))
    for svc, data in services.items():
        data.pop(\'build\', None)
        data.pop(\'env_file\', None)
        data.pop(\'container_name\', None)
        data[\'networks\'] = {\'default\': {}}
        for volume in data.get(\'volumes\', []):
            if volume.get(\'type\') != \'volume\' or volume.get(\'source\') not in allowed_volumes:
                abort(\'Unexpected bind mount or volume in \' + svc + \'.\')
        if svc in (\'api\', \'worker\', \'migrate\'):
            data[\'image\'] = api_image
            data[\'environment\'][\'DATABASE_URL\'] = db_url
        if svc == \'web\':
            data[\'image\'] = web_image
            data[\'networks\'][\'proxy\'] = {\'aliases\': [PROJECT]}
    # Migration runs explicitly once per deployment, before application up.
    for svc in (\'api\', \'worker\', \'web\'):
        services[svc][\'depends_on\'] = {}
    for key in list(config):
        if key.startswith(\'x-\'):
            del config[key]
    return config

def escaped_config(config):
    # Compose has already resolved .env; protect literal $ in values on re-reading JSON.
    result = json.loads(json.dumps(config))
    for svc in result[\'services\'].values():
        svc[\'environment\'] = {k: (v.replace(\'$\', \'$$\') if isinstance(v, str) else v)
                              for k, v in svc.get(\'environment\', {}).items()}
    return result

def main():
    os.umask(0o077)
    # Do not let global Jenkins environment settings override this credential file.
    keep = {\'PATH\', \'HOME\', \'LANG\', \'LC_ALL\', \'DOCKER_HOST\', \'DOCKER_CONTEXT\',
            \'DOCKER_CONFIG\', \'DOCKER_TLS_VERIFY\', \'DOCKER_CERT_PATH\', \'XDG_RUNTIME_DIR\',
            \'SSH_AUTH_SOCK\', \'SSL_CERT_FILE\', \'SSL_CERT_DIR\', \'HTTP_PROXY\', \'HTTPS_PROXY\', \'NO_PROXY\'}
    child = {k: v for k, v in os.environ.items() if k in keep}
    command([\'docker\', \'network\', \'inspect\', NETWORK, \'--format\', \'{{.Name}}\'], child, \'Proxy network lookup\')
    api_image, web_image = os.environ[\'ORAL_API_IMAGE\'], os.environ[\'ORAL_WEB_IMAGE\']
    for image in (api_image, web_image):
        command([\'docker\', \'image\', \'inspect\', image, \'--format\', \'{{.Id}}\'], child, \'Built image lookup\')
    with tempfile.TemporaryDirectory(prefix=\'oral-deploy-\') as temp:
        folder = Path(temp)
        shutil.copyfile(os.environ[\'ORAL_ENV_FILE\'], folder / \'.env\')
        shutil.copyfile(\'docker-compose.yml\', folder / \'docker-compose.yml\')
        base = [\'docker\', \'compose\', \'-p\', PROJECT, \'--project-directory\', temp,
                \'--env-file\', str(folder / \'.env\'), \'-f\', str(folder / \'docker-compose.yml\')]
        config = configure(json.loads(command(base + [\'config\', \'--format\', \'json\'], child, \'Compose validation\')), api_image, web_image)
        print(\'Deployment configuration validated; AI_PROVIDER=\' + config[\'services\'][\'api\'][\'environment\'].get(\'AI_PROVIDER\', \'demo\'), flush=True)
        current_pg = \'\'
        for cid in command([\'docker\', \'ps\', \'-q\'], child, \'Port inventory\').split():
            owner = command([\'docker\', \'inspect\', cid, \'--format\', \'{{index .Config.Labels "com.docker.compose.project"}}\'], child, \'Container ownership\').strip()
            ports = json.loads(command([\'docker\', \'inspect\', cid, \'--format\', \'{{json .HostConfig.PortBindings}}\'], child, \'Port bindings\')) or {}
            if owner != PROJECT and any(p.get(\'HostPort\') in (WEB_PORT, CONSOLE_PORT) for rows in ports.values() for p in rows or []):
                abort(\'Port 13000 or 19001 is occupied by another Docker project. No deployment made.\')
            if owner == PROJECT:
                service = command([\'docker\', \'inspect\', cid, \'--format\', \'{{index .Config.Labels "com.docker.compose.service"}}\'], child, \'Service lookup\').strip()
                if service == \'postgres\':
                    current_pg = cid
                    old = dict(x.split(\'=\', 1) for x in json.loads(command([\'docker\', \'inspect\', cid, \'--format\', \'{{json .Config.Env}}\'], child, \'Database configuration\')) if \'=\' in x)
                    new = config[\'services\'][\'postgres\'][\'environment\']
                    if any(old.get(k) != new.get(k) for k in (\'POSTGRES_USER\', \'POSTGRES_DB\', \'POSTGRES_PASSWORD\')):
                        abort(\'Database credentials changed. Restore previous values or plan a database credential rotation.\')
        runtime = folder / \'compose.runtime.json\'
        runtime.write_text(json.dumps(escaped_config(config)), encoding=\'utf-8\')
        # Empty interpolation file: the runtime configuration already has all env values.
        (folder / \'empty.env\').touch()
        compose = [\'docker\', \'compose\', \'-p\', PROJECT, \'--project-directory\', temp,
                   \'--env-file\', str(folder / \'empty.env\'), \'-f\', str(runtime)]
        # Verify the second Compose parse preserved every credential exactly.
        actual = json.loads(command(compose + [\'config\', \'--format\', \'json\'], child, \'Runtime configuration validation\'))
        for svc in config[\'services\']:
            if actual[\'services\'][svc].get(\'environment\', {}) != config[\'services\'][svc].get(\'environment\', {}):
                abort(\'Environment changed during Compose interpolation. No deployment made.\')
        print(\'Pulling PostgreSQL, Redis and MinIO images...\', flush=True)
        command(compose + [\'pull\', \'postgres\', \'redis\', \'minio\'], child, \'Infrastructure image pull\')
        if current_pg:
            backup_dir = Path(os.environ.get(\'JENKINS_HOME\', \'/var/jenkins_home\')) / \'oral-backups\'
            backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            name = datetime.datetime.now(datetime.timezone.utc).strftime(\'%Y%m%dT%H%M%SZ\') + \'-build-\' + os.environ[\'BUILD_NUMBER\'] + \'.dump\'
            backup = backup_dir / name
            pg = config[\'services\'][\'postgres\'][\'environment\']
            with backup.open(\'xb\') as stream:
                result = subprocess.run([\'docker\', \'exec\', current_pg, \'pg_dump\', \'-U\', pg[\'POSTGRES_USER\'], \'-d\', pg[\'POSTGRES_DB\'], \'-Fc\'], env=child, stdout=stream, stderr=subprocess.PIPE)
            if result.returncode:
                backup.unlink(missing_ok=True)
                abort(\'Database backup failed; deployment stopped before migration.\')
            with backup.open(\'rb\') as stream:
                result = subprocess.run([\'docker\', \'exec\', \'-i\', current_pg, \'pg_restore\', \'--list\'], env=child, stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if result.returncode:
                abort(\'Database backup archive check failed; deployment stopped.\')
            print(\'Database backup saved under JENKINS_HOME/oral-backups/\' + name, flush=True)
        # Stop only this project\'s application before changing its database schema.
        command(compose + [\'stop\', \'web\', \'worker\', \'api\'], child, \'Application stop\')
        print(\'Starting database, Redis and MinIO...\', flush=True)
        command(compose + [\'up\', \'-d\', \'--no-deps\', \'--no-build\', \'--pull\', \'never\', \'--wait\', \'--wait-timeout\', \'240\', \'postgres\', \'redis\', \'minio\'], child, \'Infrastructure startup\')
        print(\'Running Alembic migration and admin bootstrap...\', flush=True)
        command(compose + [\'run\', \'--rm\', \'--no-deps\', \'-T\', \'--pull\', \'never\', \'migrate\'], child, \'Migration/bootstrap\')
        print(\'Starting API...\', flush=True)
        command(compose + [\'up\', \'-d\', \'--no-deps\', \'--no-build\', \'--pull\', \'never\', \'--wait\', \'--wait-timeout\', \'300\', \'api\'], child, \'API health check\')
        print(\'Starting worker and web...\', flush=True)
        command(compose + [\'up\', \'-d\', \'--no-deps\', \'--no-build\', \'--pull\', \'never\', \'--wait\', \'--wait-timeout\', \'240\', \'worker\', \'web\'], child, \'Web/worker startup\')
        print(\'Oral web deployment healthy. Worker is running (no dedicated worker healthcheck in source).\', flush=True)
        print(\'Nginx upstream: http://oral-assessment-web:3000\', flush=True)
        print(\'Public URL after proxy configuration: \' + ORIGIN, flush=True)

if __name__ == \'__main__\':
    main()

ORAL_DEPLOY_PY
'''
                }
            }
        }
    }
    post {
        always {
            junit allowEmptyResults: true, testResults: 'oral-test-results.xml'
            sh '''set +x
if [ -n "${ORAL_TEST_CONTAINER:-}" ]; then docker rm -f "$ORAL_TEST_CONTAINER" >/dev/null 2>&1 || true; fi
if [ -n "${ORAL_WEB_CHECK_IMAGE:-}" ]; then docker image rm "$ORAL_WEB_CHECK_IMAGE" >/dev/null 2>&1 || true; fi
'''
        }
        success {
            echo 'Oral web deployed. Nginx upstream: oral-assessment-web:3000'
        }
        failure {
            echo 'Build/deploy failed. No automatic database downgrade or rollback. Review the failed stage; keep all Oral volumes.'
        }
    }
}