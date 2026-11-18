"""Collect local bootstrap values; only emit JSON into the consuming process."""
import getpass,json,sys
if sys.stdout.isatty():raise SystemExit("Pipe output directly to the bootstrap process; do not print credentials.")
with open("/dev/tty","r+") as tty:
 def field(label):
  tty.write(label+": ");tty.flush();return tty.readline().strip()
 data={"email":field("Owner email"),"name":field("Owner name"),"agency":field("Agency name"),"slug":field("Agency slug")}
 data["password"]=getpass.getpass("Owner password (16+ characters): ",stream=tty)
 if data["password"]!=getpass.getpass("Repeat password: ",stream=tty):raise SystemExit("Confirmation failed")
 sys.stdout.write(json.dumps(data))
