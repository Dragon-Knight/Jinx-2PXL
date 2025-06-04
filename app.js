// npm install ws serialport
// node app.js


const { SerialPort } = require('serialport');
const dgram = require('dgram');
const WebSocket = require('ws');
const { PXLStream } = require('./PXLStream');


const cfg_serial = { path: 'COM10', baudRate: 1500000/*, highWaterMark: 150000*/};
const cfg_socket = { type: 'udp4', address: '127.0.0.1', port: 65506 };
const cfg_wss = { port: 8080 }
const cfg_pxl = { width: 128, height: 16 };


const obj_serial = new SerialPort(cfg_serial);
const obj_socket = dgram.createSocket(cfg_socket.type);
const obj_wss = new WebSocket.Server(cfg_wss);
const obj_pxl = new PXLStream(cfg_pxl);


const originalLog = console.log;
console.log = (...args) => 
{
	const now = new Date();
	const timeStr = now.toLocaleTimeString('en-GB', { hour12: false }) + ':' + String(now.getMilliseconds()).padStart(3, '0');
	originalLog(`[${timeStr}]`, ...args);
};

/*
SerialPort.list().then(ports => 
{
	ports.forEach(function(port)
	{
		console.log(port.path);
	})
});
*/

obj_socket.on('message', async (msg, rinfo) => 
{
	if(msg[0] !== 0x9C || msg[msg.length - 1] !== 0x36)
	{
		console.log('RX error frame: No start / stop byte!');
		return;
	}
	
	const cmd = msg[1];
	const length = msg[2] << 8 | msg[3];
	const packet_number = msg[4];
	const number_of_packets = msg[5];
	const dataStart = 6;
	const dataEnd = dataStart + length;
	
	if(msg.length != dataEnd + 1)
	{
		console.log('RX error frame: No valid length!');
		return;
	}
	
	const pixelData = msg.subarray(dataStart, dataEnd);

	obj_pxl.PutFrame(pixelData, 0);
	
	obj_wss.clients.forEach(client => 
	{
		if(client.readyState === WebSocket.OPEN)
		{
			client.send(pixelData);
		}
	});
	
	//console.log('RX Frame (' + packet_number + '/' + number_of_packets + '): cmd:', cmd, ', len:', length, ', pixels:', (length / 3));
});

obj_socket.bind(cfg_socket.port, cfg_socket.address, () => 
{
	console.log('UDP server listening on ' + cfg_socket.address + ':' + cfg_socket.port);
});


obj_wss.on('connection', (ws, req) => 
{
	ws.send([cfg_pxl.width, cfg_pxl.height]);
});




let SerialBuffer = Buffer.alloc(0);
obj_serial.on('data', (chunk) => 
{
	SerialBuffer = Buffer.concat([SerialBuffer, chunk]);
	
	const idx = SerialBuffer.indexOf(0x0A);	// поиск \n
	if(idx !== -1)
	{
		const packet = SerialBuffer.subarray(0, idx);
		//SerialBuffer = SerialBuffer.subarray(idx + 1);
		
		handleSerialPacket(packet);

		SerialBuffer = Buffer.alloc(0);
	}
});


function handleSerialPacket(packet)
{
	if(packet.length === 0)
		return;
	
	const pxls_packet = ParsePXLSBuffer(packet);
	if(pxls_packet !== null)
	{
		//console.log('PXLS: ' + pxls_packet.cmd, pxls_packet.offset, pxls_packet.length);
		
		switch(pxls_packet.cmd)
		{
			case 1:
			{
				const buf = GeneratePXLSPacket('2', 0, 0, []);
				obj_serial.write(buf);
				
				break;
			}
			case 3:
			{
				//console.time('myFunc');
				const data = obj_pxl.GetData(pxls_packet.offset, pxls_packet.length);
				const buf = GeneratePXLSPacket('4', pxls_packet.offset, data.length, data);
				let qqq = obj_serial.write(buf);
				//obj_serial.drain(() => {});
				//console.timeEnd('myFunc');
				//console.log(qqq);
				
				break;
			}
			case 5:
			{
				const buf = GeneratePXLSPacket('6', 0, 0, []);
				obj_serial.write(buf);
				
				break;
			}
			default:
			{
				const buf = GeneratePXLSPacket('0', 0, 0, []);
				obj_serial.write(buf);
				
				break;
			}
		}
	}
	else
	{
		console.log(packet.toString('utf8'));
	}

	return;
}

const pxls_prefix = Buffer.from('+PXLS=');

function ParsePXLSBuffer(buf)
{
	if(buf.length < pxls_prefix.length || buf.subarray(0, pxls_prefix.length).equals(pxls_prefix) === false)
		return null;
	
	const values = [];
	let num = 0;
	let i = 6;
	while(i <= buf.length)
	{
		const b = buf[i];
		
		if(b === 0x2C || i === buf.length)
		{
			values.push(num);
			num = 0;
			i++;
		}
		else if(b >= 0x30 && b <= 0x39)
		{
			num = num * 10 + (b - 0x30);
			i++;
		}
		else
			return null;
	}
	
	if(values.length !== 3)
		return null;
	
	return { cmd: values[0], offset: values[1], length: values[2] };
}

function GeneratePXLSPacket(id, offset, length, data)
{
	let header = `${id},${offset},${length}\n`;
	
	let body = '';
	if(length > 0 && data)
	{
		body = Buffer.from(data.slice(0, length)).toString('latin1');
	}
	
	let packet = pxls_prefix + header + body + '\n';
	
	return Buffer.from(packet, 'latin1');
}
