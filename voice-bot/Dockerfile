FROM andrius/asterisk:20-alpine

# Install Python + pip + ffmpeg (for audio conversion) + minio/requests/httpx
RUN apk add --no-cache python3 py3-pip py3-httpx ffmpeg
RUN pip3 install --no-cache-dir minio requests

# Copy AGI scripts
COPY agi/ /var/lib/asterisk/agi-bin/
RUN chmod +x /var/lib/asterisk/agi-bin/*.py

# Copy Asterisk config
COPY config/ /etc/asterisk/

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD asterisk -rx "core show uptime" || exit 1

EXPOSE 5060/udp 5060/tcp 10000-10100/udp

CMD ["asterisk", "-f", "-vvvv"]
