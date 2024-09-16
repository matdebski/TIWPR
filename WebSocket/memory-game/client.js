// \\wsl.localhost\Ubuntu-22.04\home\matheus\study-project\tiwpr\websockets\memory-game\index.html
const ws = new WebSocket("ws://localhost:8080")
document.getElementById('joinGameBtn').addEventListener('click', join_game);
document.getElementById('createGameBtn').addEventListener('click', create_game);


Game = {
    "gameID": window.sessionStorage.getItem("gameID"),
    "board": [],
    "representation_matrix": [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    "playerID": window.sessionStorage.getItem("playerID"),
    "opponentID": "????????????????????????????????????",
    "player_points": 0,
    "opponent_points": 0,
    "move": [],
    "turn": false
}

ws.binaryType = "arraybuffer"
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const tileSize = 150;
const gapSize = 15;

displayLobby()

ws.onmessage = (msg) => {

    //console.log(msg)
    parsed_msg = binary_receive(msg.data)

    console.log(parsed_msg)

    switch (parsed_msg.type) {
        case "create":
            Game.gameID = parsed_msg.gameID
            window.sessionStorage.setItem("gameID", Game.gameID)
            console.log(`Created Game with id: ${Game.gameID}`)
            Game.board = parsed_msg.board
            drawBoard(Game.board, Game.representation_matrix)
            updateScoreboard()
            displayLobby()
            break;

        case "join":
            switch (parsed_msg.status) {
                case "success":
                    Game.gameID = parsed_msg.gameID
                    window.sessionStorage.setItem("gameID", Game.gameID)
                    Game.board = parsed_msg.board
                    Game.opponentID = parsed_msg.opponentID
                    console.log(`Player ${Game.playerID} joined to the game: aaa and his opponent is: ${parsed_msg.opponentID}`)
                    displayLobby()
                    updateScoreboard()
                    drawBoard(Game.board, Game.representation_matrix)
                    break;
                case "no_exist":
                    console.log(`Game with id aaa not found!`)
                    Game.gameID = null
                    window.sessionStorage.setItem("gameID", null)
                    displayLobby()
                    break;

                case "full":
                    console.log(`Game is already full!`)
                    break;
                case "reconnect":
                    Game.opponentID = parsed_msg.opponentID
                    Game.board = parsed_msg.board
                    Game.representation_matrix = parsed_msg.representation_matrix
                    Game.player_points = parsed_msg.player_points
                    Game.opponent_points = parsed_msg.opponent_points
                    updateScoreboard()
                    Game.turn = parsed_msg.turn
                    drawBoard(Game.board, Game.representation_matrix)
                    if (parsed_msg.move.length > 0) {
                        console.log(parsed_msg.move)
                        handle_move(parsed_msg.move[0][0], parsed_msg.move[0][1])
                    }
                    console.log(`Player ${Game.playerID} reconnected to the game ${Game.gameID} and his opponent is: ${parsed_msg.opponentID}`)
                    break;
            }
            break;
        case "start":
            console.log(`Opponent joined: ${parsed_msg.opponentID} to the game!`)
            Game.opponentID = parsed_msg.opponentID
            updateScoreboard()
            Game.turn = true
            break;
        case "move":
            console.log(parsed_msg)
            handle_move(parsed_msg.move[0], parsed_msg.move[1])
            break;

        default:
            console.log(`Unknow message type!: ${parsed_msg.type}`)
            break;
    }
};

ws.onopen = (event) => {

    if (!Game.playerID) {

        Game.playerID = crypto.randomUUID()
        window.sessionStorage.setItem("playerID", Game.playerID)

    }

    if (Game.gameID) {
        join_game()
    }

}

ws.onclose = () => {
    console.log(`Player ${Game.playerID} disconnected!`)

}

ws.onerror = (error) => {
    console.log("Error: ", error)
}

function join_game() {

    let game_id
    if (Game.gameID === null) {

        game_id = document.getElementById('gameIdInput').value;
        document.getElementById('gameIdInput').textContent = ""
        console.log(game_id)
    }
    binary_send(
        {
            "type": "join",
            "playerID": Game.playerID,
            "gameID": Game.gameID ? Game.gameID : game_id
        }
    )
}

function create_game() {
    binary_send(
        {
            "type": "create",
            "playerID": Game.playerID,
        })

}

function binary_send(str_msg) {
    const encoded_msg = new TextEncoder().encode(JSON.stringify(str_msg))
    ws.send(encoded_msg)
}

function binary_receive(bytes) {
    let msg = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(msg)

}

function drawBoard(board, representation_matrix) {

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            drawTile(row, col, board[row][col], representation_matrix[row][col], tileSize, gapSize)
        }
    }
}

function drawTile(row, col, letter, representation, tileSize, gapSize) {
    const x = col * tileSize + gapSize;
    const y = row * tileSize + gapSize;

    const background_colors = ['#333', '#FFF', '#c6f6c6', '#fa8072']

    ctx.fillStyle = background_colors[representation]
    ctx.fillRect(x, y, tileSize - gapSize, tileSize - gapSize);
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = representation > 0 ? 'black' : 'white';
    ctx.fillText(representation > 0 ? letter : "?", x + tileSize / 2 - 2.5, y + tileSize / 2);
    if (representation > 0) {
        ctx.strokeStyle = "black";
        ctx.strokeRect(x, y, tileSize - gapSize, tileSize - gapSize);
    }
}

let isProcessingMove = false; //blokowanie klikania w trakcie przetwarzania ruchu

canvas.addEventListener('click', (event) => {

    if (Game.turn && !isProcessingMove) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const col = Math.floor(x / (tileSize + gapSize));
        const row = Math.floor(y / (tileSize + gapSize));

        const xUpperLimit = tileSize * (col + 1)
        const xLowerLimit = xUpperLimit - (tileSize - gapSize)

        const yUpperLimit = tileSize * (row + 1)
        const yLowerLimit = yUpperLimit - (tileSize - gapSize)

        if (x > xLowerLimit && x < xUpperLimit && y > yLowerLimit && y < yUpperLimit) {

            if (Game.representation_matrix[row][col] === 0) {
                isProcessingMove = true;
                binary_send({
                    "type": "move",
                    "playerID": Game.playerID,
                    "gameID": Game.gameID,
                    "move": [row, col]

                })
                handle_move(row, col)

            }
        }
    }

});

function handle_move(row, col) {

    Game.representation_matrix[row][col] = Game.turn ? 2 : 3;
    drawBoard(Game.board, Game.representation_matrix);

    Game.move.push([row, col])


    if (Game.move.length == 2) {
        if (Game.board[Game.move[0][0]][Game.move[0][1]] === Game.board[Game.move[1][0]][Game.move[1][1]]) {
            Game.representation_matrix[Game.move[0][0]][Game.move[0][1]] = 1
            Game.representation_matrix[Game.move[1][0]][Game.move[1][1]] = 1
            if (Game.turn) Game.player_points += 1; else Game.opponent_points += 1;

        } else {
            Game.representation_matrix[Game.move[0][0]][Game.move[0][1]] = 0
            Game.representation_matrix[Game.move[1][0]][Game.move[1][1]] = 0
        }
        Game.move = []

        sleep(2000).then(() => {
            if (countOnes(Game.representation_matrix) === 16) {
                updateScoreboard()
                isProcessingMove = false;
                game_over()
            } else {
                drawBoard(Game.board, Game.representation_matrix);
                updateScoreboard()
                Game.turn = Game.turn ? false : true
                isProcessingMove = false;
            }
        });

    } else {

        isProcessingMove = false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateScoreboard() {
    document.getElementById('playerId').textContent = Game.playerID;
    document.getElementById('playerPoints').textContent = Game.player_points;
    document.getElementById('opponentId').textContent = Game.opponentID;
    document.getElementById('opponentPoints').textContent = Game.opponent_points;
    document.getElementById('opponentPoints').textContent = Game.opponent_points;
    document.getElementById('gameId').textContent = Game.gameID
}

function displayLobby() {
    var lobby = document.getElementById("lobby");

    if (Game.gameID) {
        lobby.style.display = "none";

    } else {
        lobby.style.display = "flex";
        lobby.style.justifyContent = "center"
    }
}

function countOnes(matrix) {
    let count = 0;

    for (let row = 0; row < matrix.length; row++) {
        for (let col = 0; col < matrix[row].length; col++) {
            if (matrix[row][col] === 1) {
                count++;
            }
        }
    }

    return count;
}

function drawGameOverScreen(status) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'black'
    ctx.fillText(status, canvas.width / 2 - 2.5, canvas.height / 2);
}

function game_over() {

    console.log(`Player points: ${Game.player_points}, Opponent points: ${Game.opponent_points}`)
    let game_status;
    if (Game.player_points > Game.opponent_points) {
        game_status = `Victory! <refresh page>`
    }
    else if (Game.player_points < Game.opponent_points) {
        game_status = `You lost <refresh page>`
    }
    else {
        game_status = "Draw <refresh page>"
    }

    binary_send({
        "type": "game_over",
        "gameID": Game.gameID,
        "playerID": Game.playerID
    })

    sleep(1000).then(() => {
        drawGameOverScreen(game_status)
        Game = {
            "gameID": null,
            "board": [],
            "representation_matrix": [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            "playerID": window.sessionStorage.getItem("playerID"),
            "opponentID": "????????????????????????????????????",
            "player_points": 0,
            "opponent_points": 0,
            "move": [],
            "turn": false
        }
        window.sessionStorage.setItem("gameID", null)
    });
}

