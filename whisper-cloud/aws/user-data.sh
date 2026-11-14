#!/bin/bash
# User data for ONE EC2 worker of the EC2 addendum (docs/whisper-cloud-criteria.md, section 6).
# AMI: Ubuntu Server 24.04 LTS, x86_64. cloud-init runs it once, as root, on the first boot.
#
# It builds the phase A image from the Dockerfile pinned below (checked with SHA-256) and runs it with the
# phase A limits. The port is published on 127.0.0.1 ONLY: the agent reaches it through an SSH tunnel and
# nothing listens on the internet except sshd. --restart unless-stopped brings the container back after the
# instance is stopped and started again, which is what C2 measures.
#
# Progress: /var/log/chessspeak-userdata.log. Ready marker: /var/log/chessspeak-ready.
set -euo pipefail
exec > >(tee -a /var/log/chessspeak-userdata.log) 2>&1
echo "inicio $(date -u +%FT%TZ)"

# last commit on main that changed whisper-cloud/Dockerfile, and the SHA-256 of that file
REPO_COMMIT=d3c072cb65654ceb5d6f3bafbc249e505047dbbb
DOCKERFILE_SHA256=726eca680a591e0abde125bbab608c4f45fc4cdcda3a647cfdabc8e14482f845
IMAGE=chessspeak-whisper:small-d1be6fd

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io curl
systemctl enable --now docker

mkdir -p /opt/chessspeak
cd /opt/chessspeak
curl -fsSL -o Dockerfile "https://raw.githubusercontent.com/TWC-FINE/ChesssPeak/${REPO_COMMIT}/whisper-cloud/Dockerfile"
echo "${DOCKERFILE_SHA256}  Dockerfile" | sha256sum -c -

# the build context holds only the Dockerfile: it downloads whisper.cpp and the model itself, both pinned
docker build --build-arg MODEL=small -t "${IMAGE}" .
echo "imagen construida $(date -u +%FT%TZ)"

docker run -d --name whisper --restart unless-stopped --cpus=2 --memory=2g -p 127.0.0.1:8080:8080 "${IMAGE}"

for _ in $(seq 1 120); do
  if curl -fs http://127.0.0.1:8080/health >/dev/null; then
    echo "listo $(date -u +%FT%TZ)" | tee /var/log/chessspeak-ready
    exit 0
  fi
  sleep 1
done
echo "whisper-server no respondió a /health en 120 s"
exit 1
