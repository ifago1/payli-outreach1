# Deploy — productie op een Ubuntu VPS achter Cloudflare

Korte handleiding voor het opzetten van payli-outreach achter `outreach.payli.be`
met Cloudflare voor TLS, Caddy als reverse proxy en systemd als procesmanager.

## Eenmalig — installeer

Vereisten op een verse Ubuntu 22.04 / 24.04 server:

```bash
# Node 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential

# Caddy (reverse proxy op poort 80)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Repo klonen + installeren:

```bash
cd ~
git clone https://github.com/ifago1/payli-outreach1.git
cd payli-outreach1
cp .env.example .env   # KVK test-key staat al ingevuld
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
bash deploy/install.sh
```

`deploy/install.sh` doet `npm ci`, `db:push`, `npm run build`, en zet de
systemd-service neer op `127.0.0.1:3000`.

## DNS + Cloudflare

1. **AWS**: koppel een Elastic IP aan de instance (anders verandert het IP bij
   elke stop/start en breekt je DNS).
2. **Cloudflare**: maak een **A-record** `outreach` → `<elastic-ip>` met de
   oranje wolk (proxied) aan.
3. **Cloudflare → SSL/TLS → Overview**: zet op **Flexible** (Cloudflare praat
   in HTTP met de origin). Upgrade later naar **Full (strict)** met een
   Cloudflare Origin Certificate als je een cert op de origin wil installeren.
4. **AWS security group**: open inkomend **TCP 80** vanaf `0.0.0.0/0`
   (of strenger: alleen de [Cloudflare IPs](https://www.cloudflare.com/ips/)).
   Sluit poort 3000 — die hoeft niet open te staan voor de buitenwereld.

## Updaten naar een nieuwe versie

```bash
cd ~/payli-outreach1
bash deploy/update.sh
```

Doet `git pull`, `npm ci`, `db:push`, `npm run build`, en `systemctl restart`.

## Beheer

```bash
# Status
sudo systemctl status payli-outreach

# Logs live
sudo journalctl -u payli-outreach -f

# Stoppen / starten
sudo systemctl stop payli-outreach
sudo systemctl start payli-outreach
```

## Tips

- **Swap** voor kleine instances (<2 GB RAM). Anders breekt `next build` met
  `Killed`. 2 GB swap toevoegen:

  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

- **Cron sync** (KVK-mutaties draaien):

  ```bash
  ( crontab -l 2>/dev/null; \
    echo "0 7 * * * curl -fsS -X POST http://127.0.0.1:3000/api/sync/cron \
      -H 'authorization: Bearer ${CRON_SECRET}' >/dev/null" ) | crontab -
  ```
