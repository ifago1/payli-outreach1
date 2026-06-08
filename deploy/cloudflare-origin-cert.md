# HTTPS op de origin met een Cloudflare Origin Certificate

Cloudflare biedt gratis een 15-jaar geldig **Origin Certificate** dat alleen
geldig is voor verkeer tussen Cloudflare en jouw server. Hiermee kun je CF op
**Full (strict)** zetten — end-to-end versleuteld.

## 1. Genereer het certificaat in Cloudflare

1. Open **Cloudflare dashboard → payli.be → SSL/TLS → Origin Server**.
2. Klik **Create Certificate**.
3. Vul in:
   - **Private key type**: ECC (kleiner & sneller) of RSA (2048).
   - **Hostnames**: `outreach.payli.be` (voeg ook `*.payli.be` toe als je later
     meer subdomeinen wil afdekken).
   - **Certificate Validity**: 15 jaar.
4. Klik **Create**.

Je krijgt twee tekstblokken te zien:

- **Origin Certificate** — begint met `-----BEGIN CERTIFICATE-----`
- **Private key** — begint met `-----BEGIN PRIVATE KEY-----` (of `EC PRIVATE KEY`)

**Belangrijk**: je ziet de private key maar één keer. Kopieer beide.

## 2. Installeer ze op de server

Op de server, plaats in `/etc/caddy/`:

```bash
sudo nano /etc/caddy/origin.crt
# Plak de hele "Origin Certificate" inhoud incl. BEGIN/END regels. Opslaan met Ctrl+O, Ctrl+X.

sudo nano /etc/caddy/origin.key
# Plak de hele "Private key" inhoud incl. BEGIN/END regels. Opslaan.

sudo chmod 644 /etc/caddy/origin.crt
sudo chmod 600 /etc/caddy/origin.key
sudo chown caddy:caddy /etc/caddy/origin.crt /etc/caddy/origin.key
```

Controleer dat ze niet leeg of corrupt zijn:
```bash
sudo openssl x509 -in /etc/caddy/origin.crt -noout -subject -dates
```

## 3. Werk de Caddyfile bij en herlaad

```bash
cd ~/payli-outreach1
git pull
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo ss -tlnp | grep -E ':80|:443'
```

Verwacht: Caddy luistert nu op zowel **`:80`** als **`:443`**.

## 4. Open poort 443 in de AWS security group

**AWS Console → EC2 → Instances → instance → Security → security group →
Edit inbound rules → Add rule:**

- Type: **HTTPS** (vult poort 443 automatisch in)
- Source: `0.0.0.0/0` (of strikt: alleen de
  [Cloudflare IPs](https://www.cloudflare.com/ips/))

## 5. Zet Cloudflare op Full (strict)

**Cloudflare dashboard → payli.be → SSL/TLS → Overview → Full (strict).**

Wacht ~30 seconden en refresh `https://outreach.payli.be`. CF gebruikt nu HTTPS
naar de origin én valideert het cert dat we net geïnstalleerd hebben.

## Verifiëren

```bash
# Direct testen vanaf je laptop (negeer cert-warning — CF Origin cert is
# alleen geldig binnen Cloudflare, niet voor het publiek):
curl -kI https://3.122.83.125 -H "Host: outreach.payli.be"
```

Of in de browser, refresh `https://outreach.payli.be`. Slotje aanwezig (van
Cloudflare's edge-cert), en in de Cloudflare-dashboard zie je onder Analytics
dat de origin nu via HTTPS wordt aangesproken.

## Rolback

Als iets stuk gaat tijdens de switch, zet Cloudflare tijdelijk terug op
**Flexible** — dan gaat verkeer weer via HTTP poort 80 (Caddy's eerste blok)
en heb je tijd om het cert-probleem te onderzoeken zonder downtime.
