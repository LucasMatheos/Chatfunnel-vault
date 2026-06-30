---
name: no-core-nodemodules-edit
enabled: true
event: file
action: block
pattern: "node_modules[/\\\\]@chatfunnel[/\\\\]core[/\\\\]"
---
BLOCKED: Nunca edite node_modules/@chatfunnel/core diretamente. Edite chatfunnel-core/src/ e o build/sync é feito manualmente pelo usuário.
