# barbearia-eight-sigma

Site responsivo em HTML, CSS e JavaScript puro. Abra `index.html` no navegador ou sirva a pasta com qualquer hospedagem estática.

## O que já está incluído

- Logo vetorial moderno, usado também como ícone do site.
- Serviços cadastráveis, editáveis, ocultáveis e removíveis pela Área da barbearia. O cadastro tem uma tela própria com nome, descrição, preço obrigatório e duração; serviços publicados aparecem com o preço na página principal.
- Seleção de serviço, dia e horários calculados a partir do expediente configurado.
- Cada loja recebe um endereço próprio no formato `?loja=slug`.
- Cada barbearia cadastra seu próprio usuário e senha para acessar serviços, valores, expediente e pedidos da loja.
- A conta ADM entra pela opção **ADM** e pode selecionar e administrar todas as barbearias.
- Serviços, horários, perfil e reservas são separados por barbearia.
- O cliente escolhe um horário e envia a solicitação pelo WhatsApp da loja.

## Supabase

O Supabase guarda o perfil público das lojas, serviços, expediente e reservas. As políticas RLS isolam os dados pela barbearia. Visitantes veem somente os horários ocupados, sem nome ou telefone dos clientes. A chave em `supabase-config.js` é publishable; não coloque uma chave `secret` ou `service_role` no site.

## Ativação de várias barbearias

A migration `supabase/migrations/20261027013859_multi_barbershop_tenancy.sql` adiciona as tabelas de perfil e membros e associa serviços, expediente e reservas a uma loja. Ela foi aplicada ao projeto Supabase de produção. Cada barbearia cria uma conta própria na Área da barbearia; após confirmar o e-mail, configura sua loja e recebe um link exclusivo.

## Limitações operacionais

- O pedido é salvo no Supabase e abre uma conversa pré-preenchida no WhatsApp; a pessoa ainda precisa enviar a mensagem.
- O Supabase guarda reservas; confirmação por WhatsApp permanece manual.
- O site estático precisa ser republicado para as alterações de código aparecerem no endereço público.
- Cada barbearia precisa cadastrar o WhatsApp antes de aceitar pedidos pelo site.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` publica o conteúdo do projeto sempre que há um push para `main`. No repositório GitHub, abra **Settings → Pages** e selecione **GitHub Actions** em **Build and deployment → Source**.

## Publicação

O repositório GitHub está conectado à Vercel; cada atualização enviada para a branch `main` inicia uma nova publicação de produção.

A migration `supabase/migrations/20261027015119_platform_admin_access.sql` concede acesso global às contas registradas em `barber_admins`; cada conta de barbearia continua restrita à própria loja.
