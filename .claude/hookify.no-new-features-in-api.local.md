---
name: no-new-features-in-api
enabled: true
event: file
action: warn
pattern: "chatfunnel-api[/\\\\]src[/\\\\]"
---
WARNING: chatfunnel-api está em modo manutenção. Novas features devem ir em chatfunnel-services/ (NestJS). Só continue se estiver estendendo código legado existente neste arquivo.
