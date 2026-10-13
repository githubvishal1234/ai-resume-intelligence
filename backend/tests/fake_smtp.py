"""A tiny in-process SMTP server for tests (no TLS). Records each message it accepts."""

from __future__ import annotations

import base64
import socketserver
import threading
from email import message_from_bytes
from email.message import Message


class FakeSmtp:
    def __init__(self) -> None:
        self.messages: list[Message] = []
        self.logins: list[tuple[str, str]] = []
        self.fail = False
        outer = self

        class Handler(socketserver.StreamRequestHandler):
            def reply(self, line: str) -> None:
                self.wfile.write((line + "\r\n").encode())

            def handle(self) -> None:
                self.reply("220 fake ESMTP")
                while True:
                    raw = self.rfile.readline()
                    if not raw:
                        return
                    cmd = raw.decode().rstrip("\r\n")
                    verb = cmd.split(" ", 1)[0].upper()
                    if verb == "EHLO":
                        self.reply("250-fake")
                        self.reply("250 AUTH PLAIN")
                    elif verb == "AUTH":
                        _, user, password = base64.b64decode(cmd.split()[2]).split(b"\0")
                        outer.logins.append((user.decode(), password.decode()))
                        self.reply("235 ok")
                    elif verb in ("MAIL", "RCPT"):
                        self.reply("550 no" if outer.fail else "250 ok")
                    elif verb == "DATA":
                        self.reply("354 go")
                        lines = []
                        while (line := self.rfile.readline()) not in (b".\r\n", b""):
                            lines.append(line[1:] if line.startswith(b"..") else line)
                        outer.messages.append(message_from_bytes(b"".join(lines)))
                        self.reply("250 queued")
                    elif verb == "QUIT":
                        self.reply("221 bye")
                        return
                    else:
                        self.reply("250 ok")

        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
