# Viagens

Site da família para planear viagens: cada viagem tem a sua página com os hotéis, os preços e uma votação.

- **Site:** HTML, CSS e JavaScript simples, sem build. Publicado na Vercel a partir deste repositório.
- **Dados:** Supabase (projeto `viagens`). Tabelas `trips`, `hotels` e `votes`; esquema em `supabase/migrations/`.

## Acrescentar uma viagem nova

1. No painel do Supabase, em **Table Editor → trips**, crie uma linha nova. O `slug` é o endereço da página (ex.: `paris-2027` fica em `/#paris-2027`).
2. Em **hotels**, acrescente os hotéis com o `trip_id` dessa viagem. O campo `rank` define a ordem e `breakfast` aceita `incluido` ou `confirmar`.
3. O site mostra a viagem nova sozinho, sem precisar de publicar nada.

## Correr localmente

Qualquer servidor estático serve, por exemplo `npx serve .`.
