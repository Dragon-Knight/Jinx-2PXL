const { PXLFramePack } = require('./PXLFramePack');

class PXLStream
{
	// Параметры, определяемые конструктором
	#params = 
	{
		width: 0,			// Ширина экрана, пикселей
		height: 0,			// Высота экрана, пикселей
	};
	
	// Размеры заголовков файла PXL, байт
	#sizes = 
	{
		header_file: 10,	// Размер заголовка файла
		header_frame: 4,	// Размер заголовка кадра
	};
	
	#pixel_packer = null;
	#buffer = null;
	#buffer_idx = 0;
	
	#frame_send = false;	// Флаг активной отправки кадра
	#frame_bytes = 0;		// Фактическое кол-во байт виртуального PXL файла
	
	
	constructor(params)
	{
		this.#params = Object.assign({}, this.#params, params);
		
		this.#pixel_packer = new PXLFramePack({width: this.#params.width, height: this.#params.height, pixel: 14, strip: 0});

		this.#CreateBuffer( this.#pixel_packer.GetMaxFrameSize() );
		this.#InitBuffer( this.#pixel_packer.GetPixelStripByte() );
		
		return;
	}
	
	// Вставляет кадр и выставляет флаг что кадр готов для отправки
	PutFrame(pixels, timeout)
	{
		if(this.#frame_send === true)
			return false;
		
		const new_buffer_idx = this.#pixel_packer.Run(pixels, timeout, this.#buffer, this.#buffer_idx);
		this.#frame_bytes = (new_buffer_idx - this.#buffer_idx) + this.#sizes.header_file;
		
		this.#buffer_idx = this.#sizes.header_file;
		
		return true;
	}
	
	GetData(offset, length)
	{
		// Если запрашиваем блок с кадром (заголовок кадра + пиксели), то блокируем обновление кадра
		if(offset >= this.#sizes.header_file)
		{
			this.#frame_send = true;
		}
		
		let real_length = Math.min(length, (this.#buffer.length - offset));
		let data = this.#buffer.slice(offset, (offset + real_length));
		
		// Если запросили последний кусок данных, то снимаем блокировку обновления кадра
		if((offset + length) >= this.#frame_bytes)
		{
			this.#frame_send = false;
		}
		
		return data;
	}


	#CreateBuffer(frame_size)
	{
		this.#buffer = new Uint8Array( this.#sizes.header_file + frame_size );
		this.#buffer_idx = 0;
		
		return;
	}
	
	
	#InitBuffer(pixel_strip_byte)
	{
		this.#buffer[this.#buffer_idx++] = 'P'.charCodeAt(0);
		this.#buffer[this.#buffer_idx++] = 'X'.charCodeAt(0);
		this.#buffer[this.#buffer_idx++] = 'L'.charCodeAt(0);

		this.#buffer[this.#buffer_idx++] = 0x02;

		this.#buffer[this.#buffer_idx++] = this.#params.width;

		this.#buffer[this.#buffer_idx++] = this.#params.height;

		this.#buffer[this.#buffer_idx++] = pixel_strip_byte;

		let frames = 1;
		this.#buffer[this.#buffer_idx++] = (frames >> 0) & 0xFF;
		this.#buffer[this.#buffer_idx++] = (frames >> 8) & 0xFF;

		this.#buffer[this.#buffer_idx++] = 0x00;

		return;
	}
};

module.exports = { PXLStream };
