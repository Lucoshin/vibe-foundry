import { createHash } from 'node:crypto';

function invalid(format) { throw new Error(`${format} 图片容器损坏或不受支持。`); }
function dimensions(width,height,format) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) invalid(format);
  return {width,height};
}
function crc32(bytes) {
  let crc=0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function pngSize(bytes) {
  let offset=8, size, hasData=false;
  while(offset+12<=bytes.length) {
    const length=bytes.readUInt32BE(offset), end=offset+12+length;
    if(end>bytes.length) invalid('PNG');
    const type=bytes.toString('ascii',offset+4,offset+8), data=bytes.subarray(offset+8,end-4);
    if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4)) invalid('PNG');
    if(offset===8 && type!=='IHDR') invalid('PNG');
    if(type==='IHDR') {
      if(size || length!==13 || data[10]!==0 || data[11]!==0 || data[12]>1) invalid('PNG');
      const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!depths[data[9]]?.includes(data[8])) invalid('PNG');
      size=dimensions(data.readUInt32BE(0),data.readUInt32BE(4),'PNG');
    }
    if(type==='acTL') throw new Error('暂不支持动画 PNG 图片；请显式选择静态帧。');
    if(type==='IDAT' && length) hasData=true;
    if(type==='IEND') {
      if(length!==0 || end!==bytes.length || !size || !hasData) invalid('PNG');
      return size;
    }
    offset=end;
  }
  invalid('PNG');
}
function jpegSize(bytes) {
  let offset=2, size, scanned=false, entropy=false;
  const frames=[0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf];
  while(offset<bytes.length) {
    if(entropy) {
      while(offset<bytes.length && bytes[offset]!==0xff) offset++;
    }
    if(bytes[offset++]!==0xff) invalid('JPEG');
    while(bytes[offset]===0xff) offset++;
    if(offset>=bytes.length) invalid('JPEG');
    const marker=bytes[offset++];
    if(entropy && (marker===0 || marker>=0xd0 && marker<=0xd7)) continue;
    entropy=false;
    if(marker===0xd9) {
      if(!size || !scanned || offset!==bytes.length) invalid('JPEG');
      return size;
    }
    if(marker===0xd8 || marker===0 || offset+2>bytes.length) invalid('JPEG');
    const length=bytes.readUInt16BE(offset), end=offset+length;
    if(length<2 || end>bytes.length) invalid('JPEG');
    if(frames.includes(marker)) {
      if(size || length<8 || length!==8+3*bytes[offset+7]) invalid('JPEG');
      size=dimensions(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3),'JPEG');
    }
    if(marker===0xda) {
      if(!size || length<6 || length!==6+2*bytes[offset+2]) invalid('JPEG');
      scanned=true;entropy=true;
    }
    offset=end;
  }
  invalid('JPEG');
}
function webpSize(bytes) {
  if(bytes.length<20 || bytes.readUInt32LE(4)+8!==bytes.length) invalid('WebP');
  let offset=12, size, extended;
  while(offset+8<=bytes.length) {
    const type=bytes.toString('ascii',offset,offset+4), length=bytes.readUInt32LE(offset+4), end=offset+8+length;
    if(end+(length%2)>bytes.length) invalid('WebP');
    const data=bytes.subarray(offset+8,end);
    if(type==='ANIM' || type==='ANMF') throw new Error('暂不支持动画 WebP 图片；请显式选择静态帧。');
    if(type==='VP8X') {
      if(offset!==12 || length!==10 || (data[0]&2)) invalid('WebP');
      extended=dimensions(data.readUIntLE(4,3)+1,data.readUIntLE(7,3)+1,'WebP');
    }
    if(type==='VP8 ') {
      if(size || length<10 || (data[0]&1) || data.toString('hex',3,6)!=='9d012a') invalid('WebP');
      size=dimensions(data.readUInt16LE(6)&0x3fff,data.readUInt16LE(8)&0x3fff,'WebP');
    }
    if(type==='VP8L') {
      if(size || length<5 || data[0]!==0x2f || data[4]>>>5) invalid('WebP');
      const packed=data.readUInt32LE(1);
      size=dimensions((packed&0x3fff)+1,((packed>>>14)&0x3fff)+1,'WebP');
    }
    offset=end+(length%2);
  }
  if(offset!==bytes.length || !size || extended && (extended.width!==size.width || extended.height!==size.height)) invalid('WebP');
  return size;
}

// Container validation and dimensions, not a full pixel decoder or semantic image analysis.
export function inspectImageBytes(bytes) {
  let format,size;
  if(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a') {format='png';size=pngSize(bytes);}
  else if(bytes.subarray(0,2).toString('hex')==='ffd8') {format='jpeg';size=jpegSize(bytes);}
  else if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') {format='webp';size=webpSize(bytes);}
  else throw new Error('图片格式不受支持；仅接受 PNG、JPEG 和静态 WebP。');
  return {digest:createHash('sha256').update(bytes).digest('hex'),format,mimeType:'image/'+format,...size,byteLength:bytes.length};
}
