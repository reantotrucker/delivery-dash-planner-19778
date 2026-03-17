

## Plano: Mapa Interativo de Rotas com Percursos Coloridos

### O que será feito

Ao clicar em "Sugerir Ordem", além de otimizar a sequência, o sistema abrirá um **mapa interativo** (Dialog/modal) mostrando todas as rotas do período no mapa de Manaus. Cada motorista terá uma **cor diferente** (usando a cor já cadastrada no banco `drivers.color`), com linhas conectando os pontos de entrega na ordem otimizada. Todas as rotas partem do endereço fixo: **R. Santa Rosa I B Mendes, 168 - Cidade de Deus, Manaus - AM, 69099-185**.

### Como funciona

1. **Geocodificação via IA** - A edge function `optimize-route-order` será atualizada para, além de retornar a ordem otimizada, retornar também **coordenadas lat/lng estimadas** para cada endereço (usando o conhecimento geográfico do modelo Gemini).

2. **Mapa com Leaflet** - Instalar `react-leaflet` + `leaflet` (gratuito, sem API key). Renderizar um mapa centrado em Manaus com:
   - Marcador fixo na origem (base/depósito)
   - Marcadores numerados para cada parada, coloridos por motorista
   - Linhas (polylines) conectando origem → parada 1 → parada 2 → ... por motorista

3. **Modal no Dashboard** - Botão "Ver Mapa" ao lado de "Sugerir Ordem". Abre um Dialog fullscreen com o mapa.

### Detalhes técnicos

**Dependências novas:** `leaflet`, `react-leaflet`, `@types/leaflet`

**Edge Function `optimize-route-order`:**
- Atualizar o prompt para pedir que a IA retorne, além dos IDs ordenados, as coordenadas estimadas de cada endereço
- Tool call retorna: `{ orderedIds: string[], coordinates: { id: string, lat: number, lng: number }[] }`
- Origem fixa: `{ lat: -3.0889, lng: -59.9856 }` (R. Santa Rosa I B Mendes, 168 - Cidade de Deus)

**Novo componente `src/components/routes/RouteMap.tsx`:**
- Recebe as rotas agrupadas por motorista, cada grupo com coordenadas e cor
- Renderiza `MapContainer` do react-leaflet com tiles do OpenStreetMap
- Para cada motorista: polyline colorida (cor do driver) + markers numerados
- Marker especial para a origem (ícone de depósito/casa)
- Popup em cada marker com nome do cliente e endereço

**Dashboard (`src/pages/Dashboard.tsx`):**
- Novo estado `mapData` para armazenar coordenadas retornadas pela IA
- Estado `mapOpen` para controlar o Dialog do mapa
- Botão "Ver Mapa" aparece quando há rotas (não precisa filtrar por motorista - mostra TODOS os motoristas com cores diferentes)
- Ao clicar, se não tem `mapData`, chama a edge function para obter coordenadas; senão usa cache

**Fluxo do usuário:**
1. Seleciona data/período no Dashboard
2. Clica "Ver Mapa"
3. Sistema chama IA com TODAS as rotas do período, agrupadas por motorista
4. IA retorna coordenadas estimadas + ordem otimizada por grupo
5. Modal abre com mapa de Manaus mostrando todas as rotas coloridas

