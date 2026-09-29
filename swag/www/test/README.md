# %СЮДА_ВСТАВИТЬ_ВАШ_ТЕСТ_САБДОМЕН%

# Лабораторная: Nginx

## Цель

Развернуть веб-страницу на поддомене:

```text
test.%ваш_сабдомен%.kitek-pg.ru
```

и настроить для неё HTTPS с сертификатом Let's Encrypt.

---

# 1. Проверить исходное состояние

Проверить контейнер:

```bash
docker ps
```

---

# 2. Создать поддомен

_В рамках того, что мы используем один и тот же домен - это делаю я за вас. Просто проверьте, что сабдомен я создал правильно и там ваш айпи_

Для поддомена должна существовать DNS-запись:

```text
test.%ваш_сабдомен%.kitek-pg.ru
```

Она должна указывать на IP вашего VPS.

Проверить DNS:

```bash
dig +short test.%ваш_сабдомен%.kitek-pg.ru
```

В результате должен быть IP вашего VPS.

---

# 3. Добавить поддомен в Nginx

Откройте существующий конфигурационный файл:

```bash
nano /srv/static-site/conf.d/default.conf
```

Добавьте отдельный `server` для поддомена:

```nginx
server {
    listen 80;
    server_name test.%ваш_сабдомен%.kitek-pg.ru;

    location / {
        root /usr/share/nginx/html/test;
        index index.html;
    }
}
```

Проверить конфигурацию:

```bash
docker exec nginx nginx -t
```

После успешной проверки:

```bash
docker compose restart
```

Проверить:

```bash
curl -I http://test.%ваш_сабдомен%.kitek-pg.ru
```

Создать папку под `test`

```bash
mkdir /srv/static-site/nginx/test
```

Создайте внутри `index.html` с содержимым `index.html` из этого репозитория

---

# 4. Проверить firewall

HTTPS будет работать через TCP-порт 443.

Проверить UFW:

```bash
sudo ufw status numbered
```

Если `443/tcp` отсутствует, добавить:

```bash
sudo ufw allow 443/tcp
```

Снова проверить:

```bash
sudo ufw status numbered
```

На этом этапе должны быть доступны как минимум:

```text
32164
80
443
```

---

# 5. Установить Certbot

Установить Certbot на VPS:

```bash
sudo apt update
sudo apt install certbot
```

Проверить:

```bash
certbot --version
```

---

# 6. Подготовиться к получению сертификата

В этой работе сертификат будем получать вручную через режим `standalone`.

Certbot временно должен занять порт `80`.

Поэтому перед получением сертификата остановите Nginx-контейнер:

```bash
docker compose down
```

Проверить:

```bash
docker ps
```

Контейнера Nginx быть не должно.

---

# 7. Получить сертификат Let's Encrypt

Выполнить:

```bash
sudo certbot certonly --standalone -d test.%ваш_сабдомен%.kitek-pg.ru
```

Certbot выполнит проверку домена и создаст сертификат.

При успешном выполнении сертификаты будут находиться примерно здесь:

```text
/etc/letsencrypt/live/test.%ваш_сабдомен%.kitek-pg.ru/
```

Проверить:

```bash
sudo ls -la /etc/letsencrypt/live/test.%ваш_сабдомен%.kitek-pg.ru/
```

В каталоге должны присутствовать:

```text
cert.pem
chain.pem
fullchain.pem
privkey.pem
```

---

# 8. Добавить сертификаты в Docker Compose

Откройте:

```bash
nano /srv/static-site/docker-compose.yaml
```

В `nginx` добавьте монтирование:

_У вас оно уже будет_

```yaml
volumes:
  - ./nginx:/usr/share/nginx/html:ro
  - ./conf.d:/etc/nginx/conf.d:ro
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

В результате часть Compose должна выглядеть примерно так:

```yaml
services:
  nginx:
    image: nginx
    container_name: nginx
    restart: unless-stopped

    ports:
      - "80:80"
      - "443:443"

    volumes:
      - ./html:/usr/share/nginx/html:ro
      - ./conf.d:/etc/nginx/conf.d:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

Обратите внимание на:

```text
:ro
```

Сертификаты монтируются в контейнер только для чтения.

---

# 9. Настроить HTTPS в Nginx

Откройте:

```bash
nano /srv/static-site/conf.d/default.conf
```

Для `test.%ваш_сабдомен%.kitek-pg.ru` настройте два `server` блока:

```nginx
server {
    listen 80;
    server_name test.%ваш_сабдомен%.kitek-pg.ru;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name test.%ваш_сабдомен%.kitek-pg.ru;

    ssl_certificate
        /etc/letsencrypt/live/test.%ваш_сабдомен%.kitek-pg.ru/fullchain.pem;

    ssl_certificate_key
        /etc/letsencrypt/live/test.%ваш_сабдомен%.kitek-pg.ru/privkey.pem;

    location / {
        root /usr/share/nginx/html/test;
        index index.html;
    }
}
```

Существующий блок для:

```text
%ваш_сабдомен%.kitek-pg.ru
```

не удаляйте.

---

# 10. Запустить Nginx

Проверить Compose:

```bash
docker compose config
```

Запустить контейнер:

```bash
docker compose up -d
```

Проверить:

```bash
docker compose ps
```

---

# 11. Проверить конфигурацию Nginx

Выполнить:

```bash
docker exec nginx nginx -t
```

Ожидаемый результат:

```text
syntax is ok
test is successful
```

Посмотреть итоговую конфигурацию:

```bash
docker exec nginx nginx -T
```

В выводе должен присутствовать:

```nginx
listen 443 ssl;
```

и:

```nginx
ssl_certificate
```

---

# 12. Проверить, что сертификат доступен внутри контейнера

Выполнить:

```bash
docker exec nginx ls -la /etc/letsencrypt/live/test.%ваш_сабдомен%.kitek-pg.ru/
```

---

# 13. Проверить HTTPS

Выполнить:

```bash
curl -I https://test.%ваш_сабдомен%.kitek-pg.ru
```

Ожидаемый ответ:

```text
HTTP/1.1 200 OK
```

или другой успешный HTTP-код.

---

# 14. Проверить перенаправление HTTP → HTTPS

Выполнить:

```bash
curl -I http://test.%ваш_сабдомен%.kitek-pg.ru
```

Ожидаемый результат:

```text
HTTP/1.1 301 Moved Permanently
Location: https://test.%ваш_сабдомен%.kitek-pg.ru/...
```

Таким образом:

```text
http://test.%ваш_сабдомен%.kitek-pg.ru
        ↓
      301
        ↓
https://test.%ваш_сабдомен%.kitek-pg.ru
```

---

# 15. Проверить сертификаты Certbot

Выполнить:

```bash
sudo certbot certificates
```

В выводе должен присутствовать сертификат:

```text
test.%ваш_сабдомен%.kitek-pg.ru
```

# 16. Сделать коммит
Поменять сверху URL, сделать коммит в репозиторий `websec-nginx-lab-ваша-фамилия` в ветку wip и сделать пул-реквест
