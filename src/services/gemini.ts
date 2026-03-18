import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateWithFallback(options: any) {
  try {
    return await ai.models.generateContent({
      ...options,
      model: 'gemini-3.1-pro-preview',
    });
  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
      console.warn('Rate limit hit for pro model, falling back to flash model...', error);
      // Fallback to flash model which has higher rate limits
      return await ai.models.generateContent({
        ...options,
        model: 'gemini-3-flash-preview',
      });
    }
    throw error;
  }
}

export async function extractLinkedInUrl(
  resumeUrl: string,
  resumeFile: { data: string; mimeType: string } | null
) {
  const promptText = `Extract the LinkedIn profile URL from the provided resume.
Return ONLY the URL as plain text. If you cannot find a LinkedIn URL, return exactly the word "NONE". Do not return any other text.`;

  const parts: any[] = [];
  if (resumeFile) {
    parts.push({ inlineData: { data: resumeFile.data, mimeType: resumeFile.mimeType } });
    parts.push({ text: promptText });
  } else {
    parts.push({ text: `Resume URL: ${resumeUrl}\n\n${promptText}` });
  }

  const response = await generateWithFallback({
    contents: { parts },
  });

  const text = response.text?.trim() || 'NONE';
  return text.includes('NONE') ? null : text;
}

export async function tailorResume(
  resumeUrl: string,
  resumeFile: { data: string; mimeType: string } | null,
  jd: string,
  manualLinkedInUrl?: string | null
) {
  const linkedInRule = manualLinkedInUrl 
    ? `1. DO NOT change ANY personal details, contact information, email, phone numbers, or URLs (GitHub, Portfolio). You MUST preserve the EXACT original links from the uploaded resume. HOWEVER, the user has explicitly provided their LinkedIn URL: ${manualLinkedInUrl}. You MUST use this exact URL for their LinkedIn profile link.`
    : `1. DO NOT change ANY personal details, contact information, email, phone numbers, or URLs (LinkedIn, GitHub, Portfolio). You MUST preserve the EXACT original links from the uploaded resume. If the exact URL is written out (e.g., linkedin.com/in/username), use that EXACT URL. NEVER guess or hallucinate URLs, and NEVER link to a generic homepage (e.g., https://linkedin.com). If you cannot determine the exact profile URL, just output the text without a link.`;

  const promptText = `You are an expert career coach and resume writer. Your task is to tailor a given resume to a specific job description.

CRITICAL RULES:
${linkedInRule}
2. ONLY modify the bullet points under jobs, the professional summary, and the skills section to align with the keywords and requirements of the job description.
3. DO NOT change any timelines, dates, company names, or job titles.
4. Format main section headers (e.g., "Summary", "Professional Experience", "Education") as Markdown Heading 2 (\`## Header\`).
5. Format the Job Title, Company Name, and Duration on the SAME line as Markdown Heading 3 (e.g., \`### Job Title | Company Name | Duration\`). Do not put them on separate lines.
6. Make important metrics and key achievements within the bullet points bold (e.g., **increased revenue by 20%**, **managed a team of 15**).
7. Output the ENTIRE tailored resume in Markdown format, enclosed in \`\`\`markdown ... \`\`\` code blocks. Do not include any conversational filler inside the code blocks.

Job Description (can be text or a URL):
${jd}
`;

  const parts: any[] = [];
  if (resumeFile) {
    parts.push({ inlineData: { data: resumeFile.data, mimeType: resumeFile.mimeType } });
    parts.push({ text: `My Current Resume is attached.\n\n${promptText}` });
  } else {
    parts.push({ text: `My Current Resume is available at this URL: ${resumeUrl}\n\n${promptText}` });
  }

  const response = await generateWithFallback({
    contents: { parts },
    config: {
      tools: [{ urlContext: {} }, { googleSearch: {} }],
    },
  });

  return response.text || '';
}

export async function refineResume(currentResume: string, userRequest: string) {
  const prompt = `You are an expert resume writer.
Here is the CURRENT state of the user's resume:
<current_resume>
${currentResume}
</current_resume>

The user wants to make the following change:
"${userRequest}"

Please apply this change to the resume.
CRITICAL RULES:
1. Output a brief explanation of what you changed.
2. Output the ENTIRE updated resume in Markdown format, enclosed in \`\`\`markdown ... \`\`\` code blocks.
3. DO NOT change ANY personal details, contact information, email, phone numbers, or URLs (LinkedIn, GitHub, Portfolio). You MUST preserve the EXACT original links from the current resume. NEVER guess or hallucinate URLs, and NEVER link to a generic homepage (e.g., https://linkedin.com).
4. Do not change timelines, dates, or job titles.
`;

  const response = await generateWithFallback({
    contents: prompt,
  });

  return response.text || '';
}

export function extractMarkdown(text: string): { explanation: string, markdown: string } {
  // Try to find content inside markdown code blocks
  const match = text.match(/```(?:markdown)?\n([\s\S]*?)\n```/i);
  if (match) {
    const markdown = match[1].trim();
    const explanation = text.replace(match[0], '').trim();
    return { explanation, markdown };
  }
  
  // If no code block, try to find the first heading (usually the start of the resume)
  const headingMatch = text.match(/^(#+ .*)$/m);
  if (headingMatch) {
    const startIndex = text.indexOf(headingMatch[1]);
    const markdown = text.slice(startIndex).trim();
    const explanation = text.slice(0, startIndex).trim() || "Here is the updated resume.";
    return { explanation, markdown };
  }

  // Fallback: assume the whole thing is the resume
  return { explanation: "Here is the updated resume.", markdown: text.trim() };
}
