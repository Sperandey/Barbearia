// Array para armazenar os nomes dos amigos
let amigos = [];

// Função para adicionar um amigo à lista
function adicionarAmigo() {
    const campoAmigo = document.getElementById('amigo'); // Captura o campo de entrada
    const nomeAmigo = campoAmigo.value.trim(); // Remove espaços desnecessários

    // Validação do campo de entrada
    if (nomeAmigo === '') {
        alert('Por favor, insira um nome.');
        return;
    }

    // Adiciona o nome ao array
    amigos.push(nomeAmigo);

    // Atualiza a lista visível na tela
    atualizarLista();

    // Limpa o campo de entrada
    campoAmigo.value = '';
}

// Função para atualizar a lista de amigos na interface
function atualizarLista() {
    const listaAmigos = document.getElementById('listaAmigos'); // Seleciona a lista de amigos
    listaAmigos.innerHTML = ''; // Limpa a lista para evitar duplicação

    // Percorre o array amigos e cria elementos de lista (<li>) para exibição
    amigos.forEach(amigo => {
        const novoItem = document.createElement('li');
        novoItem.textContent = amigo;
        listaAmigos.appendChild(novoItem);
    });
}

// Função para sortear um amigo aleatório
function sortearAmigo() {
    // Valida se há amigos disponíveis
    if (amigos.length === 0) {
        alert('A lista de amigos está vazia. Adicione pelo menos um amigo antes de sortear.');
        return;
    }

    // Gera um índice aleatório
    const indiceAleatorio = Math.floor(Math.random() * amigos.length);

    // Obtém o nome sorteado usando o índice gerado
    const amigoSorteado = amigos[indiceAleatorio];

    // Exibe o resultado na interface
    const resultado = document.getElementById('resultado');
    resultado.innerHTML = `<li>O amigo sorteado é: ${amigoSorteado}</li>`;
}
