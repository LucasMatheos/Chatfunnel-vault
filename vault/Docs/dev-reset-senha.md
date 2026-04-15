---
title: Dev — Reset de senha (hash)
tags: [dev, utilidades, auth]
---

# Reset de senha — hash dev

Hash bcrypt pronto pra colar direto no banco quando precisar resetar senha de um usuário em dev.

## Senha123

```
$2b$10$46yeL1bvKYybrKTMcFL/juFhHW2aFlvSslug5XxcK5/cKTHz6zGG6
```

- Senha em texto: `Senha123`
- Algoritmo: bcrypt, cost 10

## Como usar

```sql
UPDATE users
SET password = '$2b$10$46yeL1bvKYybrKTMcFL/juFhHW2aFlvSslug5XxcK5/cKTHz6zGG6'
WHERE email = '<email-alvo>';
```

Login em seguida com `Senha123`.

> ⚠️ Uso restrito a ambientes de desenvolvimento. Nunca aplicar em `release`/`production`.
