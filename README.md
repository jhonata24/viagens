# Viagens

Site da família para planear viagens. Cada viagem tem quatro separadores:

- **Hotéis:** comparação de preços e notas, com votação no preferido.
- **Roteiro:** PDF do roteiro para todos abrirem, e paragens por dia num mapa, com ordem otimizada e link para a rota a pé no Google Maps. Pode haver várias opções de roteiro (tabela `itinerary_variants`); as opções com `auto_order = false` mantêm a ordem por horário.
- **Atrações:** lista de coisas para fazer, que se vão marcando como feitas.
- **Contas:** despesas divididas em partes iguais, com o resumo de quem deve a quem (euros e libras em separado).

Quem tem o link pode ver e editar tudo (pensado para uso em família).

- **Site:** HTML, CSS e JavaScript simples, sem build. Publicado na Vercel a partir deste repositório.
- **Dados:** Supabase (projeto `viagens`). Tabelas `trips`, `hotels` e `votes`; esquema em `supabase/migrations/`.

## Acrescentar uma viagem nova

1. No painel do Supabase, em **Table Editor → trips**, crie uma linha nova. O `slug` é o endereço da página (ex.: `paris-2027` fica em `/#paris-2027`).
2. Em **hotels**, acrescente os hotéis com o `trip_id` dessa viagem. O campo `rank` define a ordem e `breakfast` aceita `incluido` ou `confirmar`.
3. O site mostra a viagem nova sozinho, sem precisar de publicar nada.

## Correr localmente

Qualquer servidor estático serve, por exemplo `npx serve .`.
