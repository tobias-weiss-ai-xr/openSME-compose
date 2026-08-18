-- openSME — PostgreSQL init
-- Creates additional databases required by services.
-- This file is auto-executed on first container start
-- when mounted to /docker-entrypoint-initdb.d/.

-- Zitadel identity management
CREATE DATABASE zitadel;

-- SOGo groupware database
CREATE DATABASE sogo;
