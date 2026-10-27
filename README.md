# barbearia-eight-sigma — Barbearia do Édi

Site responsivo em HTML, CSS e JavaScript puro. Abra `index.html` no navegador ou sirva a pasta com qualquer hospedagem estática.

## O que já está incluído

- Logo vetorial moderno, usado também como ícone do site.
- Serviços cadastráveis, editáveis, ocultáveis e removíveis pela Área da barbearia. O cadastro tem uma tela própria com nome, descrição, preço obrigatório e duração; serviços publicados aparecem com o preço na página principal.
- Seleção de serviço, dia e horários calculados a partir do expediente configurado.
- Pedido de horário com nome e WhatsApp; a solicitação abre uma conversa pré-preenchida com o Edy.
- Reels públicos incorporados do Instagram.
- Endereço, mapa, Instagram e WhatsApp.

## Supabase

O projeto Supabase `Barbearia do Edy` (região `sa-east-1`) armazena serviços, expediente e pedidos. A agenda se atualiza em tempo real. Pedidos novos ficam pendentes e já seguram o horário; o barbeiro confirma ou cancela no painel. A chave no `supabase-config.js` é publishable, própria para navegador; não coloque uma chave `secret` ou `service_role` no site.

Para liberar a Área da barbearia, crie um usuário de autenticação no Supabase em **Authentication → Users → Add user**. Depois, autorize esse usuário no SQL Editor:

```sql
insert into public.barber_admins (user_id)
select id from auth.users where email = 'EMAIL_DO_BARBEIRO';
```

Troque o texto pelo e-mail exato do usuário criado. Somente usuários nessa tabela podem acessar dados pessoais dos pedidos e alterar serviços, expediente ou status.

As tabelas foram criadas com RLS habilitado. Clientes anônimos só podem ler serviços ativos e as colunas de agenda sem nome/telefone; podem inserir pedidos pendentes. A conta do barbeiro autenticada é autorizada separadamente.

## Limitações operacionais

- O pedido é salvo no Supabase e abre uma conversa pré-preenchida no WhatsApp; a pessoa ainda precisa enviar a mensagem.
- O Supabase guarda reservas; confirmação por WhatsApp permanece manual.
- O site estático precisa ser republicado para as alterações de código aparecerem no endereço público.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` publica o conteúdo do projeto sempre que há um push para `main`. No repositório GitHub, abra **Settings → Pages** e selecione **GitHub Actions** em **Build and deployment → Source**.

## Ajustes antes de divulgar

1. Abra **Área da barbearia** no rodapé e configure o expediente real.
2. Cadastre preços, duração e serviços reais. Os três serviços iniciais são exemplos editáveis e exibem “Consultar” até o barbeiro informar os valores reais.
3. Os três Reels na seção Instagram são IDs fixos. Para trocar, substitua os códigos das URLs em `index.html` por outros Reels públicos da conta.

Contato e endereço foram lidos do perfil público `@barbeariadoedi.nh` em 23/10/2026.

