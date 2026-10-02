# Sincronizar o app com uma planilha do Google

Isso deixa os mesmos ingredientes, sabores e orçamentos nos aparelhos de vocês (o seu e o da Karlla)
e guarda uma cópia numa planilha da sua conta. Leva uns 5 minutos e você faz uma vez só.

## 1. Criar a planilha e colar o script (no computador)

1. Entre em **sheets.google.com** com a sua conta e crie uma **planilha em branco**. Dê um nome, por exemplo *Pipocas da Mel · dados*.
2. No menu da planilha: **Extensões → Apps Script**.
3. Apague o código que aparece e cole **todo** o conteúdo do arquivo `Code.gs` desta pasta.
4. Na linha `const SENHA = 'troque-esta-senha';` troque **só** o texto entre aspas dessa linha (não use localizar e substituir) (letras e números, sem espaços). Anote essa senha.
5. Clique no disquete (**Salvar projeto**).

## 2. Publicar

1. Clique em **Implantar → Nova implantação**.
2. Na engrenagem ao lado de "Selecionar tipo", escolha **App da Web**.
3. Preencha:
   - **Executar como:** Eu (seu e-mail)
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar**. O Google vai pedir autorização: **Autorizar acesso**, escolha a sua conta e,
   se aparecer "O Google não verificou este app", clique em **Avançado → Acessar (nome do projeto)** e depois em **Permitir**.
   (É o seu próprio script, por isso o aviso aparece.)
5. Copie o **URL do app da Web**, que termina em `/exec`.

## 3. Conectar o app

1. No iPhone, abra o app → **Ajustes → Sincronizar com a planilha do Google**.
2. Cole o endereço `/exec` e digite a mesma senha. Toque em **Conectar e sincronizar**.
3. Faça o mesmo no aparelho da Karlla, com o mesmo endereço e a mesma senha.

Na primeira conexão o app envia tudo o que já estiver cadastrado nele. Se os dois aparelhos já tinham
cadastros separados, eles se juntam, e itens com o mesmo nome podem ficar duplicados. Nesse caso, apague a cópia que sobrar.

## Como funciona no dia a dia

- O app salva no aparelho na hora e envia para a planilha em seguida. Sem internet, ele continua funcionando
  e envia quando a conexão voltar. Em Ajustes e embaixo do título aparece "Aguardando enviar".
- Se duas pessoas mudarem o mesmo item, vale a mudança mais recente.
- Na planilha você verá as abas **Ingredientes**, **Sabores** e **Orçamentos** para consultar.
  Pode ler e copiar à vontade, mas edite só pelo app. A aba **Dados** é a que o app usa: não mexa nela.
- Apagar um item no app apaga nos dois aparelhos.

## Cuidados

- Quem tem o **endereço + a senha** consegue ler e gravar os dados. Não publique esses dois juntos.
- Para trocar a senha: mude no script, **Implantar → Gerenciar implantações → editar → Nova versão** e atualize a senha nos aparelhos.
- Se você mudar o código do script, é preciso criar uma **nova versão** da implantação para valer.
