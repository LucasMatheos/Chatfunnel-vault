---
name: no-redundant-axios-catch
enabled: true
event: file
action: warn
pattern: "chatfunnel-front[/\\\\]src[/\\\\].*\\.(ts|vue)$"
---
WARNING: Os interceptors do Axios já tratam erros globalmente (toast, redirect). Só adicione um catch se tiver lógica de recovery específica (estado de fallback, retry). Remova catches redundantes que apenas relançam o erro ou não fazem nada.
