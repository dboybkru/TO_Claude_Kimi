"""One-shot SSH command runner using paramiko.

Usage: python ssh_run.py "command to run"

Reads SSH password from SSH_PASS env var. Prints stdout/stderr/exit-code.
"""
import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = "195.14.118.66"
USER = "root"
TIMEOUT = 300

def main() -> int:
    if len(sys.argv) < 2:
        print("usage: ssh_run.py '<command>'", file=sys.stderr)
        return 2
    cmd = sys.argv[1]
    password = os.environ.get("SSH_PASS")
    if not password:
        print("SSH_PASS env var not set", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=password, timeout=15, banner_timeout=15)
    try:
        stdin, stdout, stderr = client.exec_command(cmd, timeout=TIMEOUT, get_pty=False)
        stdin.close()
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        if out:
            sys.stdout.write(out)
        if err:
            sys.stderr.write(err)
        return rc
    finally:
        client.close()

if __name__ == "__main__":
    sys.exit(main())
