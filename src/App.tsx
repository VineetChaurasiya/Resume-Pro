import { useState } from 'react';
import { FileText, Briefcase, Sparkles, Download, ArrowLeft, Send, Loader2, Edit3, Eye, UploadCloud, Link as LinkIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { tailorResume, refineResume, extractMarkdown, extractLinkedInUrl } from './services/gemini';
import { marked } from 'marked';
// @ts-ignore
import html2pdf from 'html2pdf.js';

export default function App() {
  const [step, setStep] = useState<'input' | 'editor'>('input');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFile, setResumeFile] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [jdInput, setJdInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setResumeFile({ data: base64, mimeType: file.type, name: file.name });
        setResumeUrl('');
      };
      reader.readAsDataURL(file);
    }
  };
  
  const [tailoredResume, setTailoredResume] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [manualLinkedInUrl, setManualLinkedInUrl] = useState('');
  
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');

  const handleTailor = async () => {
    if ((!resumeFile && !resumeUrl.trim()) || !jdInput.trim()) return;
    setIsProcessing(true);
    try {
      const extractedUrl = await extractLinkedInUrl(resumeUrl, resumeFile);
      if (!extractedUrl) {
        setShowLinkedInModal(true);
        setIsProcessing(false);
        return;
      }
      await executeTailor(null);
    } catch (error: any) {
      console.error(error);
      alert("Failed to process resume. Please try again.");
      setIsProcessing(false);
    }
  };

  const executeTailor = async (linkedInUrl: string | null) => {
    setShowLinkedInModal(false);
    setIsProcessing(true);
    try {
      const result = await tailorResume(resumeUrl, resumeFile, jdInput, linkedInUrl);
      const { markdown } = extractMarkdown(result);
      setTailoredResume(markdown);
      setChatHistory([{ role: 'ai', text: "I've tailored your resume to the job description. How does it look? You can ask me to make further changes, or edit it manually." }]);
      setStep('editor');
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes('429') || error?.message?.includes('quota')) {
        alert("The AI service is currently experiencing high traffic or has reached its quota limit. Please try again in a few minutes.");
      } else {
        alert("Failed to tailor resume. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefine = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || isProcessing) return;
    
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsProcessing(true);
    
    try {
      const result = await refineResume(tailoredResume, userMsg);
      const { markdown, explanation } = extractMarkdown(result);
      
      if (markdown && markdown !== tailoredResume) {
        setTailoredResume(markdown);
      }
      
      setChatHistory(prev => [...prev, { role: 'ai', text: explanation || "I've updated the resume based on your request." }]);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes('429') || error?.message?.includes('quota')) {
        setChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, the AI service is currently experiencing high traffic or has reached its quota limit. Please try again in a few minutes." }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, I encountered an error while trying to update the resume." }]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePdf = async () => {
    setIsDownloading(true);
    try {
      let markdownToParse = tailoredResume.trim();
      // Ensure the first line is an h1 for the Name
      if (!markdownToParse.startsWith('#')) {
        const lines = markdownToParse.split('\n');
        lines[0] = `# ${lines[0].replace(/\\*\\*/g, '')}`; // Remove bold if it was already bolded
        markdownToParse = lines.join('\n');
      }

      const htmlContent = await marked.parse(markdownToParse, { breaks: true, gfm: true });
      
      const htmlString = `
        <div id="pdf-export-container">
          <style>
            #pdf-export-container {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              color: #000000;
              background-color: #ffffff;
              line-height: 1.5;
              font-size: 10pt;
            }
            #pdf-export-container h1 { font-size: 20pt; font-weight: bold; margin-bottom: 8px; margin-top: 0; color: #000000; text-align: center; display: block; border-bottom: none; }
            #pdf-export-container h1 + p { text-align: center; margin-bottom: 16px; }
            #pdf-export-container h2 { font-size: 13pt; font-weight: bold; margin-bottom: 8px; margin-top: 16px; color: #000000; border-bottom: 1px solid #000000; padding-bottom: 2px; text-transform: uppercase; display: block; }
            #pdf-export-container h3 { font-size: 11.5pt; font-weight: bold; margin-bottom: 4px; margin-top: 12px; color: #000000; display: block; }
            #pdf-export-container p { margin-bottom: 8px; display: block; }
            #pdf-export-container ul { margin-bottom: 12px; padding-left: 0; margin-left: 0; list-style-type: none; display: block; }
            #pdf-export-container ol { margin-bottom: 12px; padding-left: 0; margin-left: 0; list-style-type: none; counter-reset: item; display: block; }
            #pdf-export-container ul > li { position: relative; padding-left: 16px; margin-bottom: 4px; display: block; text-align: left; }
            #pdf-export-container ul > li::before { content: "•"; position: absolute; left: 0; top: 0; font-weight: bold; }
            #pdf-export-container ol > li { position: relative; padding-left: 16px; margin-bottom: 4px; display: block; text-align: left; counter-increment: item; }
            #pdf-export-container ol > li::before { content: counter(item) "."; position: absolute; left: 0; top: 0; font-weight: bold; }
            #pdf-export-container a { color: #0000EE; text-decoration: underline; }
            #pdf-export-container strong { font-weight: bold; }
            #pdf-export-container em { font-style: italic; }
            #pdf-export-container * {
              border-color: #cccccc;
            }
          </style>
          ${htmlContent}
        </div>
      `;

      const opt = {
        margin:       15, // 15mm margin on all pages to ensure space after page breaks
        filename:     resumeFile ? `${resumeFile.name.replace(/\.[^/.]+$/, "")}.pdf` : 'Tailored_Resume.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
          scale: 2, 
          useCORS: true,
          windowWidth: 800
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
        enableLinks:  true
      };

      // @ts-ignore
      await html2pdf().set(opt).from(htmlString).save();
      
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (activeTab !== 'preview') {
      setActiveTab('preview');
      setTimeout(generatePdf, 100);
    } else {
      generatePdf();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white">
      {step === 'input' && (
        <div className="max-w-5xl mx-auto p-6 py-12">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-4">Resume Tailor Pro</h1>
            <p className="text-lg text-slate-600">AI-powered resume optimization for your dream job.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold">Your Current Resume</h2>
              </div>
              
              <div className="flex-1 flex flex-col gap-6 justify-center">
                {/* File Upload Area */}
                <div className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 transition-colors ${resumeFile ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 bg-slate-50'}`}>
                  {resumeFile ? (
                    <div className="flex flex-col items-center text-center">
                      <FileText className="w-12 h-12 text-indigo-600 mb-3" />
                      <p className="font-medium text-slate-900">{resumeFile.name}</p>
                      <button 
                        onClick={() => setResumeFile(null)} 
                        className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium bg-red-50 px-3 py-1 rounded-full"
                      >
                        Remove File
                      </button>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="w-12 h-12 text-slate-400 mb-3" />
                      <p className="text-sm text-slate-600 mb-4 text-center">Upload your resume (PDF, TXT) or click to browse.</p>
                      <label className="cursor-pointer bg-white border border-slate-300 px-5 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                        Browse Files
                        <input type="file" className="hidden" accept=".pdf,.txt" onChange={handleFileChange} />
                      </label>
                    </>
                  )}
                </div>

                <div className="relative flex items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">OR</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                {/* URL Input */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Paste Resume URL</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="url"
                      className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="https://example.com/resume.pdf"
                      value={resumeUrl}
                      onChange={e => {
                        setResumeUrl(e.target.value);
                        if (e.target.value) setResumeFile(null);
                      }}
                      disabled={!!resumeFile}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold">Job Description</h2>
              </div>
              <textarea 
                className="w-full flex-1 min-h-[400px] p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                placeholder="Paste the job description text or URL here..."
                value={jdInput}
                onChange={e => setJdInput(e.target.value)}
              />
            </div>
          </div>
          
          <div className="mt-8 flex justify-center">
            <button 
              onClick={handleTailor}
              disabled={isProcessing || (!resumeFile && !resumeUrl.trim()) || !jdInput.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-4 rounded-full font-medium text-lg transition-colors shadow-md hover:shadow-lg"
            >
              {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              {isProcessing ? 'Tailoring Resume...' : 'Tailor My Resume'}
            </button>
          </div>
        </div>
      )}

      {step === 'editor' && (
        <div className="h-screen flex flex-col print:h-auto print:block">
          {/* Header */}
          <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
            <div className="flex items-center gap-4">
              <button onClick={() => setStep('input')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-xl font-bold text-slate-900">Tailored Resume</h1>
            </div>
            <button 
              onClick={handlePrint}
              disabled={isDownloading}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isDownloading ? 'Generating PDF...' : 'Download PDF'}
            </button>
          </header>
          
          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden print:overflow-visible print:block">
            {/* Left Pane: Resume Preview/Edit */}
            <div className="flex-1 flex flex-col border-r border-slate-200 bg-slate-50 print:border-none print:bg-white">
              <div className="flex items-center gap-2 p-4 border-b border-slate-200 bg-white shrink-0 print:hidden">
                <button 
                  onClick={() => setActiveTab('preview')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${activeTab === 'preview' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button 
                  onClick={() => setActiveTab('edit')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${activeTab === 'edit' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Edit3 className="w-4 h-4" /> Edit Markdown
                </button>
              </div>
              
              <div className="flex-1 overflow-auto p-8 print:p-0 print:overflow-visible">
                <div className="max-w-[850px] mx-auto bg-white shadow-sm border border-slate-200 rounded-xl min-h-full print:shadow-none print:border-none print:max-w-none print:w-full">
                  {activeTab === 'preview' ? (
                    <div className="prose prose-slate max-w-none p-12 print:p-0" id="resume-preview">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{tailoredResume}</ReactMarkdown>
                    </div>
                  ) : (
                    <textarea 
                      className="w-full h-full min-h-[800px] p-12 font-mono text-sm resize-none focus:outline-none"
                      value={tailoredResume}
                      onChange={e => setTailoredResume(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>
            
            {/* Right Pane: AI Chat */}
            <div className="w-96 flex flex-col bg-white shrink-0 print:hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  AI Assistant
                </h2>
                <p className="text-xs text-slate-500 mt-1">Ask me to refine specific sections</p>
              </div>
              
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-slate-100 text-slate-800 rounded-bl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isProcessing && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user' && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-bl-none px-4 py-3 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-slate-200">
                <form 
                  onSubmit={handleRefine}
                  className="flex items-center gap-2"
                >
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="e.g. Make the summary shorter..."
                    className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={isProcessing}
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isProcessing}
                    className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LinkedIn URL Modal */}
      {showLinkedInModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                <LinkIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">LinkedIn URL Not Found</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6">
              We couldn't automatically extract your LinkedIn profile URL from the uploaded resume. 
              Would you like to provide it now so we can include it in your tailored resume?
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                LinkedIn Profile URL (Optional)
              </label>
              <input
                type="url"
                value={manualLinkedInUrl}
                onChange={(e) => setManualLinkedInUrl(e.target.value)}
                placeholder="https://linkedin.com/in/yourprofile"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => executeTailor(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => executeTailor(manualLinkedInUrl.trim() || null)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
