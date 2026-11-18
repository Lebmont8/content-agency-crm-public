# Local setup
Use a new local PostgreSQL database ending in _public. Set DATABASE_URL, PUBLIC_APP_HOST and local secrets in .env. Run npm ci, prisma generate, then prisma migrate deploy.
The public edition deliberately omits the production bootstrap and original seeds. A local owner bootstrap helper is provided; it requires PUBLIC_EDITION_BOOTSTRAP=1 and a loopback _public database. It must not be pointed at a production database.
Private AI providers and automatic sales/conversation logic are absent. Registration and external sends stay fail-closed unless explicitly configured by the operator.

After migrations, run locally:
~~~sh
export PUBLIC_EDITION_BOOTSTRAP=1
python3 scripts/bootstrap_input.py | npm run db:bootstrap --silent
unset PUBLIC_EDITION_BOOTSTRAP
~~~
The input helper uses /dev/tty (Linux/macOS); no default password or dataset is shipped. On Windows, supply a JSON object securely through standard input instead.

Before first login, generate a separate local MFA encryption key and append it to the ignored .env (without displaying it):
~~~sh
python3 -c 'import base64,secrets; from pathlib import Path; p=Path(".env"); p.open("a").write("\nAUTH_CREDENTIAL_KEY="+base64.b64encode(secrets.token_bytes(32)).decode()+"\n")'
~~~
Keep this key stable for that local database. The owner completes MFA setup at first login. Provider credentials are optional and must be configured independently; no live integrations are preconfigured.
