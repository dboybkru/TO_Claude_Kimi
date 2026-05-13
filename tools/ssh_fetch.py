"""Fetch a remote file via paramiko SFTP."""
import os, sys, paramiko
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = "195.14.118.66"; USER = "root"
def main() -> int:
    if len(sys.argv) < 3:
        print("usage: ssh_fetch.py <remote_path> <local_path>", file=sys.stderr); return 2
    remote, local = sys.argv[1], sys.argv[2]
    password = os.environ.get("SSH_PASS")
    if not password:
        print("SSH_PASS env var not set", file=sys.stderr); return 2
    t = paramiko.Transport((HOST, 22))
    t.connect(username=USER, password=password)
    try:
        sftp = paramiko.SFTPClient.from_transport(t)
        try: sftp.get(remote, local); print(f"fetched {HOST}:{remote} → {local}")
        finally: sftp.close()
    finally: t.close()
    return 0

if __name__ == "__main__": sys.exit(main())
