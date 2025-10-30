'use server';

import { PDFParse } from "pdf-parse";

const parsePDF = async (file: File): Promise<string> => {

    const parser = new PDFParse({ url: 'https://bitcoin.org/bitcoin.pdf' });

	const result = await parser.getText();
	console.log(result);
    return result;
}

export { parsePDF };