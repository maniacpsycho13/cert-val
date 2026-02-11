import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { PDFParse } from 'pdf-parse';


import { OpenRouter } from '@openrouter/sdk';
const openRouter = new OpenRouter({
  apiKey: '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'
});
const app = express();
app.use(cors());

// Multer config — store PDF in memory buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST: /extract-formdata
app.post('/about', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1️⃣ Parse the uploaded PDF
    const fileBuffer = req.file.buffer;
    const pdf = new PDFParse({ data: fileBuffer });
    const parsed = await pdf.getText();
    const parsedText = parsed.text || '';

    // 2️⃣ Create a precise extraction prompt for the LLM
    const prompt = `
You are given the text of a student's marksheet. 
Extract the following fields and return STRICT JSON ONLY (no explanation, no markdown, no text outside JSON):
{
  "fullName": "",
  "studentId": "",
  "course": "",
  "grade": "",
  "issueDate": "",
  "institution": "",
  "additionalInfo": ""
}
If a field is missing, return an empty string for that field.
Here is the marksheet text:
---
${parsedText}
---
`;

    // 3️⃣ Send to OpenRouter / LLM (replace with your actual call)
    const completion = await openRouter.chat.send({
      model: 'mistralai/mistral-nemo',
      messages: [
        { role: 'user', content: prompt }
      ],
      stream: false
    });

    const rawOutput =
      completion.output ??
      completion.choices?.[0]?.message?.content ??
      completion.choices?.[0]?.text ??
      '';

    // 4️⃣ Parse the JSON safely
    let formData;
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      formData = JSON.parse(jsonMatch ? jsonMatch[0] : rawOutput);
    } catch {
      throw new Error('Invalid JSON returned from LLM');
    }

    // 5️⃣ Guarantee the correct shape (fill missing keys)
    const normalized = {
      fullName: formData.fullName || '',
      studentId: formData.studentId || '',
      course: formData.course || '',
      grade: formData.grade || '',
      issueDate: formData.issueDate || '',
      institution: formData.institution || '',
      additionalInfo: formData.additionalInfo || ''
    };

    // ✅ Final response: matches frontend useState format exactly
    return res.json(normalized);
  } catch (err) {
    console.error('Error in /extract-formdata:', err);
    res.status(500).json({
      fullName: '',
      studentId: '',
      course: '',
      grade: '',
      issueDate: '',
      institution: ''
    });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
