# Auditoria de Segurança — MCP ChatFunnel (runtime)

| | |
|---|---|
| **Alvo** | `https://mcp-insider.chatfunnel.com.br/mcp` |
| **Tipo** | Auditoria dinâmica (servidor em execução) |
| **Escopo** | Somente leitura, sem mutação de dados |
| **Ambiente** | Staging |
| **Data** | 2026-07-30 |
| **Autorização** | Conta e token do próprio operador |

## Sumário executivo

A camada de autenticação base é sólida: o servidor rejeita requisições sem token e com token inválido, **não há SQL injection** (Prisma parametriza) e **não foi observado vazamento cross-tenant** nas tools de leitura testadas.

Dois pontos exigem correção prioritária — a configuração de **CORS** (reflexão de origem arbitrária com credenciais) e a **diferenciação das mensagens de erro de autenticação**, que expõe o mecanismo interno de multi-tenancy. Há ainda um conjunto de inconsistências de contrato e robustez de baixo impacto.

| Severidade | Achados |
|------------|---------|
| 🔴 Alto | 1 — CORS reflete origem arbitrária com credentials |
| 🟠 Médio | 2 — auth diferencia token válido/inexistente; 3 — headers de segurança ausentes |
| 🟡 Baixo | 4 — validação UUID inconsistente; 5 — erros inconsistentes; 6 — PII em respostas |

---

## 🔴 Alto

### 1. CORS reflete origem arbitrária com `Access-Control-Allow-Credentials: true`

O preflight `OPTIONS` e o `POST` respondem refletindo a origem enviada, mesmo maliciosa, junto com credenciais habilitadas.

**Evidência**
```
OPTIONS /mcp   Origin: https://evil.example.com
→ 204 No Content
  Access-Control-Allow-Origin: https://evil.example.com
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS

POST /mcp      Origin: https://evil.example.com  + token válido
→ 200 OK
  Access-Control-Allow-Origin: https://evil.example.com
  Access-Control-Allow-Credentials: true
```

**Impacto**
Se qualquer autenticação por cookie/sessão for aceita neste host — o caminho JWT (achado #2) sugere que o dashboard usa — qualquer site conseguiria disparar requisições autenticadas cross-origin com as credenciais da vítima, permitindo leitura/ação em nome dela. Com autenticação exclusivamente via `Authorization: Bearer`, o risco é menor (o navegador não anexa o header automaticamente cross-origin), mas a configuração continua perigosa e deve ser corrigida.

**Correção**
- Usar allowlist explícita de origens confiáveis.
- **Nunca** refletir o header `Origin` recebido quando `credentials: true`.
- Restringir `Access-Control-Allow-Methods` ao necessário.

---

## 🟠 Médio

### 2. Resposta de auth diferencia token válido de inexistente (information leak)

As mensagens de erro variam conforme o caminho de autenticação, revelando a arquitetura interna.

**Evidência**
```
Sem header Authorization
→ 401 {"error":"Missing Authorization header"}

Bearer mcp_live_INVALIDTOKEN123 (formato mcp, inválido)
→ 401 {"error":"Missing Account-Selected header for JWT authentication"}

Bearer garbage.jwt.token + Account-Selected: <uuid>
→ 401 {"error":"invalid token"}
```

**Impacto**
Expõe que existe um fluxo de autenticação por JWT com seleção de conta via header `Account-Selected`.

**Dúvida de design a validar (não testável em runtime sem um JWT válido):** o header `Account-Selected` é autorizado contra as contas às quais o JWT tem acesso? Se a checagem não existir, um JWT de usuário comum poderia selecionar outra conta e configurar um **bypass de multi-tenancy**. Recomenda-se validar isso no auth guard de `chatfunnel-services`.

**Correção**
- Resposta uniforme para falha de credencial (`401`, mensagem genérica), sem revelar o caminho de auth.
- Confirmar/implementar autorização do `Account-Selected` contra as contas permitidas do JWT.

### 3. Ausência de headers de segurança

As respostas trazem apenas `X-Powered-By: Express` e não incluem cabeçalhos de proteção.

**Evidência** — ausentes em respostas `200` e `401`:
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` / `Content-Security-Policy`

**Correção**
- Aplicar `helmet()` no Express.
- Remover `X-Powered-By`.
- Garantir HSTS (no edge Cloudflare e/ou na aplicação).

---

## 🟡 Baixo — contrato e robustez

### 4. Validação de UUID inconsistente entre tools

`get_contact_messages` aplica `format: uuid` + pattern rígido no schema; `get_contact`, `get_automation` e `search_contacts` aceitam `string` crua. Consequência: input não-UUID em `get_contact` gera **500** em vez de validação **400**.

**Evidência**
```
get_contact("'; DROP TABLE contacts; --")
→ {"error":{"code":"INTERNAL_ERROR","type":"internal","message":"Internal server error"}}
```

**Correção:** padronizar `format: uuid` no schema de todas as tools que recebem IDs; retornar erro de validação (não 500) para IDs malformados.

### 5. Mensagens de erro inconsistentes

| Cenário | Retorno atual | Problema |
|---------|---------------|----------|
| `get_contact` (id inexistente) | `"Contato não encontrado!"` | ok (pt) |
| `get_automation` (UUID inexistente) | `"Automation ID is required"` | semântica errada (é not-found) |
| `get_contact_messages` (id inexistente) | `"errors.Contact.ContactNotFound"` | chave i18n crua vazando |
| UUID malformado | `"Internal server error"` (500) | deveria ser 400 |

**Correção:** padronizar código estável + mensagem resolvida, mesma língua, sem expor chave de i18n.

### 6. PII em respostas

`search_contacts` devolve email, tags e **URLs assinadas do CDN do Instagram** (parâmetros `oh=`/`oe=`). É dado esperado para o dono do token, mas essas URLs assinadas são sensíveis se registradas em logs ou cacheadas.

**Evidência**
```
search_contacts("a") → quantity: 8919; itens com email + photo (URL assinada) + tags
```

**Correção:** evitar logar essas URLs; considerar proxy/expiração curta se forem persistidas.

---

## ✅ O que passou

- Rejeita ausência de token e token inválido (`401`).
- **Sem SQL injection:** `' OR 1=1 --` → `quantity: 0`; `'; DROP TABLE --` tratado como literal.
- **Sem IDOR observado:** UUIDs aleatórios e sentinelas (`00000000-…`, `ffffffff-…`) retornam `NOT_FOUND` escopado à conta do token.
- JSON malformado → `400` limpo, sem stack trace.

---

## Limitações do teste

- Escopo **read-only**: tools de escrita e `delete_*` não foram exercitadas.
- O bypass real do `Account-Selected` (achado #2) não é testável em runtime sem um JWT válido de outra conta.

## Próximos passos sugeridos

1. Corrigir CORS (#1) e headers (#3) — mudança de configuração de baixo custo.
2. Revisar o auth guard de `chatfunnel-services` para confirmar autorização do `Account-Selected` (#2) via leitura estática do código.
3. Padronizar schemas de UUID e mensagens de erro (#4, #5).
