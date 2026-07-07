# Fluxo — Camada 1 (captura + badge + notificação)

## O que já funciona
- Captura única, sem campo obrigatório
- Tela "próximo item" (um de cada vez, com Feito/Depois)
- Lista completa (pendentes + concluídos)
- Badge no ícone do app com a contagem de pendências
- Lembrete local com o texto real do próximo item (a cada 2h30 enquanto o app está aberto)
- Instalável como PWA no Android (Adicionar à tela inicial)

## O que falta pra rodar (10 minutos)

### 1. Criar o projeto no Supabase
1. Acesse supabase.com e crie um novo projeto (pode ser o mesmo workspace dos seus outros PWAs).
2. Vá em **SQL Editor**, cole o conteúdo de `supabase-schema.sql` e rode.
3. Vá em **Authentication > Sign In / Providers** e ative **Anonymous Sign-Ins**.
   - Isso permite o app identificar você sem exigir cadastro nessa camada. Quando o compartilhamento com Amanda e Marcelo entrar (Camada 3), a gente troca isso por login de verdade sem precisar mudar a estrutura de dados.
4. Vá em **Project Settings > API** e copie a **Project URL** e a **anon public key**.

### 2. Preencher `js/config.js`
Cole a URL e a chave nos dois placeholders do arquivo.

### 3. Subir na Vercel
```
vercel deploy
```
Ou arraste a pasta pelo painel da Vercel. Como é tudo estático (HTML/CSS/JS puro), não precisa de build step.

### 4. Instalar no celular
Abra a URL no Chrome do Android → menu (⋮) → **Adicionar à tela inicial**. É isso que ativa o badge no ícone.

## Sobre a notificação
O lembrete que já está funcionando dispara **enquanto o app está aberto** (mesmo minimizado). Notificação com o app totalmente fechado exige um servidor mandando push de verdade — isso é o primeiro pedaço da Camada 2, junto com a IA. O badge, esse sim, já funciona sempre, com o app aberto ou não, assim que instalado.

## Próximos passos combinados
- **Camada 2**: função serverless (Vercel) chamando Claude Haiku pra classificar tipo/categoria/prazo de cada item, e push notification real via `web-push` + VAPID.
- **Camada 3**: login de verdade + compartilhamento seletivo com Amanda e Marcelo.
