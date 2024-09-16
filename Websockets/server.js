const http = require("http");
const WebSocketServer = require("websocket").server


let games = {}
let gameID;

const httpserver = http.createServer((req, res) => {

    console.log("We have received a request");
})


const websocket = new WebSocketServer({
    "httpServer": httpserver
})

websocket.on("request", (request) => {

    const connection = request.accept(null, request.origin)
    connection.on("connect", () => console.log("Connection opened!"))
    connection.on("close", () => {
        // console.log(`Connection closed: ${JSON.stringify(connection)} !`)
    })

    connection.on("message", (message) => {
        parsed_msg = binary_receive(message.binaryData)
        // console.log(`Received message: ${JSON.stringify(parsed_msg)}`)


        switch (parsed_msg.type) {
            case "create":
                gameID = crypto.randomUUID()
                games[gameID] = { "board": createBoard(), "representation_matrix": [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], "players": {}, "turn": parsed_msg.playerID, move: [] }
                games[gameID].players[parsed_msg.playerID] = { "connection": connection, "points": 0, "opponentID": null }
                binary_send({ "type": "create", "gameID": gameID, "board": games[gameID].board }, connection)
                break;

            case "join":
                gameID = parsed_msg.gameID

                if (!games[gameID]) {
                    binary_send({
                        "type": "join",
                        "status": "no_exist",
                    }, connection)
                } else if (Object.keys(games[gameID].players).length === 2) {


                    if ((parsed_msg.playerID in games[gameID].players)) {

                        games[gameID].players[parsed_msg.playerID].connection = connection
                        binary_send({
                            "type": "join",
                            "status": "reconnect",
                            "opponentID": games[gameID].players[parsed_msg.playerID].opponentID,
                            "board": games[gameID].board,
                            "representation_matrix": games[gameID].representation_matrix,
                            "move": games[gameID].move,
                            "player_points": games[gameID].players[parsed_msg.playerID].points,
                            "opponent_points": games[gameID].players[games[gameID].players[parsed_msg.playerID].opponentID].points,
                            "turn": games[gameID].turn === parsed_msg.playerID ? true : false
                        }, connection)

                    } else {
                        binary_send({
                            "type": "join",
                            "status": "full",
                        }, connection)
                    }

                } else {
                    games[gameID].players[parsed_msg.playerID] = {
                        "connection": connection,
                        "points": 0,
                        "opponentID": games[gameID].turn
                    }
                    binary_send({
                        "type": "join",
                        "status": "success",
                        "opponentID": games[gameID].turn,
                        "board": games[gameID].board,
                        "gameID": parsed_msg.gameID
                    }, connection)

                    games[gameID].players[games[gameID].turn].opponentID = parsed_msg.playerID

                    binary_send({
                        "type": "start",
                        "opponentID": parsed_msg.playerID
                    }, games[gameID].players[games[gameID].turn].connection)
                }
                break;

            case "move":
                gameID = parsed_msg.gameID
                console.log(games)
                binary_send({
                    "type": "move",
                    "playerID": parsed_msg.playerID,
                    "move": parsed_msg.move
                }, games[gameID].players[games[gameID].players[parsed_msg.playerID].opponentID].connection)

                handle_move(parsed_msg.move, parsed_msg.gameID)

                break;

            case "game_over":
                gameID = parsed_msg.gameID

                delete games[gameID].players[parsed_msg.playerID];
                if (Object.keys(games[gameID].players).length === 0) {
                    delete games[gameID]
                }

                break;

            default:
                console.log(`Unknow message type ${parsed_msg.type}`)
                break;
        }
    })
})

httpserver.listen(8080, () =>
    console.log("My server is listening on 8080 port!")
)

function createBoard() {
    const board = [
        ["C", "D", "B", "H"],
        ["G", "G", "A", "D"],
        ["C", "F", "F", "B"],
        ["E", "A", "H", "E"]]
    return board;
}

function handle_move(move, gameID) {

    games[gameID].move.push(move)

    if (games[gameID].move.length == 2) {

        if (games[gameID].board[games[gameID].move[0][0]][games[gameID].move[0][1]] === games[gameID].board[games[gameID].move[1][0]][games[gameID].move[1][1]]) {
            games[gameID].representation_matrix[games[gameID].move[0][0]][games[gameID].move[0][1]] = 1
            games[gameID].representation_matrix[games[gameID].move[1][0]][games[gameID].move[1][1]] = 1
            games[gameID].players[games[gameID].turn].points += 1
        }
        games[gameID].move = []

        games[gameID].turn = games[gameID].players[games[gameID].turn].opponentID

    }
}

function binary_send(str_msg, connection) {
    const encoded_msg = Buffer.from(JSON.stringify(str_msg), 'utf8')
    connection.send(encoded_msg)
}

function binary_receive(bytes) {
    let msg = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(msg)

}
