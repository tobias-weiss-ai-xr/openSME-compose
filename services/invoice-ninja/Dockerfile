# invoiceninja/invoiceninja:5 ships only pdo_mysql/pdo_sqlite — postgres
# deployments need the pgsql driver baked in.
FROM invoiceninja/invoiceninja:5

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev \
 && docker-php-ext-install pdo_pgsql \
 && rm -rf /var/lib/apt/lists/*
