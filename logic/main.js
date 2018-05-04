import * as  bodyParser from 'body-parser';
import express from 'express';
import { Block, generateNextBlock, getBlockchain } from './blockchain';
import { connectToPeers, getSockets, initP2PServer } from './p2p';

const httpPort = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (myHttpPort) => {
	const app = express();

	app.use(bodyParser.json());

	app.get('/blocks', (req, res) => {
		res.send(getBlockchain());
	});

	app.post('/mineBlock', (req, res) => {
		const newBlock = generateNextBlock(req.body.data);
		res.send(newBlock);
	});

	app.get('/peers', (req, res) => {
		res.send(getSockets().map((s) => s._socket.remoteAddress + ':' + s._socket.remotePort));
	});

	app.post('/addPeer', (req, res) => {
		connectToPeers(req.body.peer);
		res.send();
	});

	app.listen(myHttpPort, () => {
		console.log(`Listening http on port: ${myHttpPort}`);
	});
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
