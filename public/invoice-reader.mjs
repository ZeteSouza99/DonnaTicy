// Assets locais, instalados por npm run invoices:setup. A nota não é enviada a um provedor de IA.
window.donnaInvoiceReaders = {
  async openPdf(data) {
    const pdf = await import('/vendor/invoice/pdf.mjs').catch(()=>{throw new Error('Leitor de PDF ainda não foi ativado nesta instalação. Use o XML ou solicite a ativação.');});
    pdf.GlobalWorkerOptions.workerSrc = '/vendor/invoice/pdf.worker.mjs';
    return pdf.getDocument({ data, isEvalSupported: false, cMapUrl:'/vendor/invoice/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/invoice/standard_fonts/' }).promise;
  },
  async recognize(image, progress) {
    if (!window.Tesseract) await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/vendor/invoice/tesseract.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('Leitor de fotos indisponível.'));document.head.appendChild(script);
    });
    const worker=await window.Tesseract.createWorker('por',1,{
      workerPath:'/vendor/invoice/worker.min.js',corePath:'/vendor/invoice/core',langPath:'/vendor/invoice/lang',workerBlobURL:false,
      logger: message=>progress(`Reconhecendo texto: ${Math.round((message.progress??0)*100)}%`),
    });
    try{return (await worker.recognize(image)).data.text;}finally{await worker.terminate();}
  },
};
