import type { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import { readFile, writeFile } from 'fs/promises';
import { processSurgicalFiles } from '../services/excelProcessor';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const form = formidable({ multiples: false });
    const [fields, files] = await form.parse(req);
    
    const file = files.file[0];
    const inputBuffer = await readFile(file.filepath);

    // Gọi hàm xử lý SurgicalDataPro
    const outputBuffer = await processExcel(inputBuffer);

    // Trả file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ket_qua.xlsx"');
    return res.send(outputBuffer);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Lỗi xử lý file Excel' });
  }
}
