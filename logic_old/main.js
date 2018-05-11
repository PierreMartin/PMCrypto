import * as  bodyParser from 'body-parser';
import express from 'express';
import { Block, generateNextBlock, getBlockchain } from './blockchain';
import { connectToPeers, getSockets, initP2PServer } from './p2p';

const httpPort = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (HttpPort) => {
	const app = express();

	app.use(bodyParser.json());

	app.use((err, req, res, next) => {
		if (err) {
			res.status(400).send(err.message)
		}
	});

	app.get('/blocks', (req, res) => {
		res.send(getBlockchain());
	});

	app.post('/mineBlock', (req, res) => {
		if (req.body.data == null) {
			res.send('data parameter is missing');
			return;
		}

		const newBlock = generateNextBlock(req.body.data);

		if (newBlock === null) {
			res.status(400).send('could not generate block');
		} else {
			res.send(newBlock);
		}
	});

	app.get('/peers', (req, res) => {
		const peers = getSockets().map((s) => {
			return `${s._socket.remoteAddress}: ${s._socket.remotePort}`;
		});

		res.send(peers);
	});

	app.post('/addPeer', (req, res) => {
		connectToPeers(req.body.peer);
		res.send();
	});

	app.listen(HttpPort, () => {
		console.log(`Listening http on port: ${HttpPort}`);
	});
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
