"""Copy a local file to the remote host via paramiko SFTP.

Usage: python ssh_copy.py <local_path> <remote_path>
Reads SSH password from SSH_PASS env var.
"""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = "195.14.118.66"
USER = "root"


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: ssh_copy.py <local_path> <remote_path>", file=sys.stderr)
        return 2
    local, remote = sys.argv[1], sys.argv[2]
    password = os.environ.get("SSH_PASS")
    if not password:
        print("SSH_PASS env var not set", file=sys.stderr)
        return 2

    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=password)
    try:
        sftp = paramiko.SFTPClient.from_transport(transport)
        try:
            sftp.put(local, remote)
            print(f"copied {local} → {HOST}:{remote}")
        finally:
            sftp.close()
    finally:
        transport.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
