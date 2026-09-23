# invoiceninja/invoiceninja:5 is Alpine-based and ships only
# pdo_mysql/pdo_sqlite — postgres deployments need the pgsql driver.
FROM invoiceninja/invoiceninja:5

USER root
RUN apk add --no-cache postgresql-dev \
 && docker-php-ext-install pdo_pgsql
USER 1500
