import { useState, useEffect, useCallback, useRef } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from "recharts";
import * as XLSX from "xlsx";

const BENCHMARK_PDF_B64 = "JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgMTAgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA5IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9Db250ZW50cyAxMSAwIFIgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXSAvUGFyZW50IDkgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvbnRlbnRzIDEyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgOSAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNyAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDkgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9BdXRob3IgKFwoYW5vbnltb3VzXCkpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA0MDIwNjMwMTErMDAnMDAnKSAvQ3JlYXRvciAoXCh1bnNwZWNpZmllZFwpKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA0MDIwNjMwMTErMDAnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAoXCh1bnNwZWNpZmllZFwpKSAvVGl0bGUgKFwoYW5vbnltb3VzXCkpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKOSAwIG9iago8PAovQ291bnQgMyAvS2lkcyBbIDQgMCBSIDUgMCBSIDYgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iagoxMCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMjI3Cj4+CnN0cmVhbQpHYXQ9KT8jTFpAJjpEZy1mTE4/UjAwNE1hbVRVPVlLbzcnSk1aYGZMbmIuKCtuJlIiRFVhaixDWmRiPkQpRDJSPE85KDZvUkBUYU9Qci1LZlI2UGdpb1diLmIlamRKU1daIUAiYEpnaENGQzJgWWtNPipkVjBtOGUvLlVqXkhzR01cOSJPcmhmQ0dSczw1NGpKYm9CTiopTFouc2dLc1wnXG9UcSpDYTNmPkBmLW0+SW9IJEhQXk4xQltPZEAkQTlpTSFsMVpoQU8qQz4qV2xHWEI/W2plNWNBVkxXVllnNnRlWENMQSlPYGslcldnInAwakUpY0cpOCwiTzQvKTRJRT9uMlxecFk1I3UsJFtyLGFMJzA/OyVANS9GXi45ciJfInFWXCtLaDNrWy1XaFZkXWVdK2JRWWguNGlCK0M3Wig1az42Yk9cPSQyUzgzaTpDaj1mZnNKPDopYS5BXkArRGxYXWQ8QztNV3Q6JF5TYVEnJDVDMVpUbElnMFJUZDFzL1goPzleX2VoLWM7Y15IKEEtTmpKKl5hQlsmVVlxUktiWFI3aEo4QkQ3QnNUKSlKWHNNOkNHZSVJR2JiJTg6ImVfPzdyWiUpLTJaMWpJV15BOD4pTzRzO2MqP1w+NG5fNl1mNzIxYiUmPlFYZDMjSnRoQSRIRnVTLytIKU8kJiReXGY9TTpJSidqZiZyWTBOIUVaXi9ULkNgMyNJV1AraGReKkVuYihVKmFhWjEyZEM9Tm1LO3UkZW0lLjYnVzksU0NPVydLPDlhUlQ5cmhTKmEtISd1aDRyKF5ZLmhTXVtLW0htXiNVJWM6YSFTNSshUU5FcmxFY0suQkxQInJabXJrTU9gY1U/SV4pU08pLFg/UWdHT2NsVjxRP2hNMDRPUyFWYSpPcGY2LGJkY2VBMXUkb2FjTFhQN28nWUlWXnUocVk+dCM4JjNvSy9ZXmMxM2E5X3JmJEU7Q1IpPHNvQEpYMjxwXEZfTlFqODMoanNpXUksZzA9JSMqb2lsNlBsKk4wNDYkZUBuYDglSyVERS84VUw3ZCdPSyFDN10vKkhybihOTHRWRCptO11QZj8tK1dUIzMqMlMiKlpjMyZcSylDR1tdSiE1K0k3WDM1b1RRKi5zOGMpTy06UFZfN2sjODtGNkU6VGA+KWlYYTRYNUJJSlguaT5RLixnU2hrUG8laW9xNjNeQ2tiLUdQV0A1N00oPiQyUlJhMzRBNmNNaTFbKSVqY1MvbW5lNyZqVDMvbF1WK29MQCZoPEolXi4rU0xFLk5YN25kQ0xwOWEudSk7OW5xMy8oJCMtNlAsKycrTikwYVQ3TUAjXUVjOS0pOV41aFZCJSpaO0pKZkYldT1ccyVpMypsSVdQVmpJQlxIaixFV0Q7NDdbJExQJitxMlIiUU9PKmU7Y2BxIjwscWA3MFohc3ReT2dfcEMlUjcuWGhoMTZcal8oZFEsKCgiPlcmc2VaO00sXGM5Z1lCP2w7QFBeRy5UWV1halhnZ285XyNQMl9SYlllUS01IjddXyMkYTduK25FXSNAKC1HXmxaQkUxWlVacz5aYG1MNSxRdDY8LCJzZS9lOjc9cyQoMGNJWkliUjVBZUFfSGg+Qy0jYW0sc1RUfj5lbmRzdHJlYW0KZW5kb2JqCjExIDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDEyMDIKPj4Kc3RyZWFtCkdhdFUxPyNTSWUmOkY1VT1RbWpZQ2R1b1VqTGovQE4jRHVNJ05XV0UsQyduVDNvODguOCNhXzljZzZkZyxoSSFjJ0YmQjNndGdZU2ZpYi4uYF9STSZrN3VEI01WXkxsUFlQbyJWS0EtSkJfQGNXWFktMXVxRFYmckVLX3NNa0svK0FoQ01RTnE6QklDK21sPkZUQCFIcTtDXThqUDlxcTVpTzhDK2siUi1yVE8iIkZKInRPUT41Y19tOlwmLEAxbXErKTZoOjJKP1FMN1FJZXA/cl1gJWJTYGFoKSpqdGlITG5SJzcpZFktdFVWQzE+UEBARWxHJ0hcdF9BbVhIXDMnS0xvSTd1SCJwJFE2VGwlNFxfTi1ZLT9xYmtwMDNndEdoXkosbEImJkslJ0NsV1IiImtWaC9FVWpQOCJvO14pMVxALkgqaG9ILVBeLnFzVjdrQ1RnKWkhVS5McnUhMippWU5haWc1czZJU3VELGRsXiJTakZrLTxLLk5SOFZCLFBvOlQ7YyJsPzhlNkQ6SkQxamdfXDFCLmVZaj9acDleQGFjbSQybCJOTzZXXWZHKSZhQCduQk9xV1o2IS9EMWtkRCJmRVZmQjhgJldNSnVvYWZsQDwiLEY+Zjo9R0FhLU4hOW9AWVZtPTtVa2BdI2QtSTE0bVRTZC1BXyxGNEk6X2dKXUcjT2YyOkQ6IkllS0lhLSVkVTYmPltpVztVLClIUk9VQ3AlQGRTOlsuTUlFOSRKMGVWVVZVS2NfXHVsKVBFalRIQmhLLkApaTFJT2Q+aDZuZ0dYVD5ydC8oQDJLWSQtdCMkITI1cm0zbFNPMjMrPVghZ25nS2szME8hMSIoQmZuYCFSYjRPIzg1dDdNMmAwa0duZ29aLFxtREQ4Mz4nMkZZLUltI0hecyZCWlghX2AxPWErMTgxbGc3PHRKZTlCJCVVaTBfRjUkOVxBJzE8Pks5NjYtPzFDK3BARjU7dHAwY3VMYWdtKWQvSipxbl9qaT9rbzJBKzheZkBMOFpJYEMiVlE6VVFGNHElaSUtclxNWElHTkdESmlXQUVdL1ZBY0gmSWRfYDJeJCs9Rio7QSVNL1I0bTRgcEMhUFZvJDNPZGx1X1owOlciRT8lTG9oTXRHSURmPEhPPkUqSz1PTm82R0JQQCNUW3RsZVRcIjNyI0ZHbFspUnUvTEpbUiJGaWVrIk1RcDU4Uj9kUlA6ImJgPS0sTWJrcS9sRTFcKCpLTFBdLVhMakErbydEUzY7T1VaPXVfTUksPz9wc20rUFdSOj9BODJsR1BNVENNLC45TShbQF4obGYnPjJjUEJcXVRkRlUtZyciLVxhJD89PjpOQzdeU14hPylSZFJSIjAvSWM9UWc0O21TRmpUNC4/VmxlN1dFRjdDcycnXGxaTyskVyxoKTxYZFlmU3JFIylRKVJJa0xCKlJBKTkjZ25QO251T21UdXJlWVZLPmhyc0BNMU8qYWxJS1FHQCNJaWMlMEZnPDg6Y2YqMF4yXVZJPSFCPj0nSkdNQldYNUw0PkJQQV0+R0dQI0ZCV1gwQjteXl1KMEsuQTs5N29xaVJSNVxvOSRrTmYma285Ln4+ZW5kc3RyZWFtCmVuZG9iagoxMiAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMDQ2Cj4+CnN0cmVhbQpHYXQ9KWdNWWI4JjpPOlNiYkpDYE4yVHRBXj1CSWwiRTtoYy0uKGlKRVtZaDNqTy9DO1U0Lk86Tz5KMURKSEgjVixbbVo4RiJUOERTRT4oWHJPWnMnREAxXXJiOi1kcDssUCdNPGBJbCc/I2ZDWjBnPTo1S0JtPjBTbklBN0lfRWtmamVxIlpLbVo6PF06Y1dLPlxXRW1MMElxQmIoJDltVmMxS01VZExgdUoiYmsvLlhpLFJaWzhgaVNoMWM1bDEyR041T0A3YWhMLWcvcyprIkgpaU8pRT5IX14jcjtOSkYxRy1eS1pvbjZdLWBFSCMhSVZWODlcbldLaE9kIXA1LFhaUl4iRnRjaGhfJ0g+ZFJrUFgmVHRoZSo4bWdLMmtKIVshVlk2UFZyIidYT3JHT1Mpb15SPm4/VWk2SmVXRW1kJltMUFlFVkdmODpWPCspY0ApZDlXX04pRnBAX2ZVQSxKbzQnUEkiI1VhaS1KPCZuYj5dRDQqPDZXUmlHa05aNGBTMEpxXCRUakkwJDBlX1k0XlhCTThKL10tQz11YDRBUmxTZ2AvYE9oWDo+Sk5CPD84WDRLb0lwUy9HQihVO2ZYUXVrJD1FMSxwSyFsIWlQVTRrR0FENSxVUl88dEg+Q2tMTGI/ZFcxJWwvYzFEJkU+JCRCWjlgWzczPEhGMm9xJl9yajsqUks7Pm5QZlhtU2tscyokI1JSJkdBXlh0W1NiSzMxY2lUYFM8TighZ01IaFlnWmUqVzFEZ2pIOVYvJlgncjUsZE5STTZyL1lmLCFbO10wN0U2IjNlNihqRmlQJVFHPD1kNGpRJWs9XTpRU0w8ckFFYWM3VTY6dF9VO2tiYzhTZkhqZGpURjdybWFYbyRtZGRDWTBESz5IK284IWlHVWNZX282MHFmUStgJXQlXG4rSyFSbT8oSzEkOGRAO083TlRFUnBvJEN1Ti9XL2FdUzZhW1EyZFZCXjhEVm8oYSlwQzpqZCMvVUYiMC8tWFs7LmhMWzkqVTZLQWlTLShrdVlkZk42P1dXbiUjbkBaL2M0Tk9ydTY5cDNuPmkyYnU0bGVuOF9HTUFmVixaUEsvNzhcbVJMYlJZay5gRmVrQCZkcT1xMmhGNVcoK1FbJyVPIUZUMiRGU0d0Ky86cCohblJBczk+UEJFdEZpTVo5QFpdU1chXFI+ZmRabSo0ZDJGNz9YWEBGY2ZgaEFxQXNlZHExNkFoJWRZUVNVW0M6SldJLTJSc01lY25sQGJPNTFuS1pbaVovMiRXV2tyS0lBXjk6c3IvTSJvQEZwIi8mRlIvVFAkJi06IVhbS2w8K08uUSdrO3JcIiY6QEVjKSxyQisxYVZHYVBXPiNnK0NlKyQmQVJAPi0/MlA0KDNCMXB+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEzCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDkgMDAwMDAgbiAKMDAwMDAwMDMyMSAwMDAwMCBuIAowMDAwMDAwNTE1IDAwMDAwIG4gCjAwMDAwMDA3MDkgMDAwMDAgbiAKMDAwMDAwMDkwMyAwMDAwMCBuIAowMDAwMDAwOTcxIDAwMDAwIG4gCjAwMDAwMDEyNTEgMDAwMDAgbiAKMDAwMDAwMTMyMiAwMDAwMCBuIAowMDAwMDAyNjQxIDAwMDAwIG4gCjAwMDAwMDM5MzUgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8Yjc2NjdhNWYwNDU5NGM0MjMzNDY0MDUwMDhhNjljMmI+PGI3NjY3YTVmMDQ1OTRjNDIzMzQ2NDA1MDA4YTY5YzJiPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA4IDAgUgovUm9vdCA3IDAgUgovU2l6ZSAxMwo+PgpzdGFydHhyZWYKNTA3MwolJUVPRgo=";

const REFERENCE_TEXT = `The Art of Digital Reading\n\nIn the modern era, digital reading has transformed how we consume information. From academic papers to novels, the shift from physical to digital media has been profound and far-reaching. This document serves as a benchmark for evaluating PDF extraction systems.\n\nChapter 1: The Evolution of Text\n\nThe history of written communication spans thousands of years. Early civilizations used clay tablets and papyrus scrolls to record their knowledge. The invention of the printing press by Johannes Gutenberg in 1440 revolutionized the distribution of information across Europe and eventually the entire world.\n\nToday, we find ourselves at another inflection point. Digital documents, particularly PDFs, have become the standard format for sharing written content across platforms and devices. The efficiency of modern text extraction systems determines how effectively this content can be repurposed for accessibility features like text-to-speech conversion.\n\nThe flow of information in a digital document must be preserved during extraction. Reading order, structural hierarchy, and semantic meaning all contribute to the fidelity of the final output. Without accurate extraction, downstream processes like audio generation will produce nonsensical results.\n\nChapter 2: Understanding Document Structure\n\nA well-structured document contains several key elements that must be correctly identified by any extraction system. Headings provide hierarchical organization. Body text conveys the primary content. Footnotes offer supplementary information. Headers and footers contain metadata like page numbers and document titles.\n\nThe challenge for any extraction system is to correctly identify these elements and present them in the proper reading order. A sidebar should not interrupt a paragraph, and a page number should not appear in the middle of a sentence. Precision and recall of structural detection directly impact the quality of the extracted content.\n\nChapter 3: The Science of Speech\n\nConverting text to speech requires understanding not just words, but context. Consider the word "read" in two different sentences. In "I read books daily" it is pronounced one way, while in "I read that book yesterday" it sounds entirely different. Similarly, "the tear in the fabric" differs from "a tear rolled down her cheek" in pronunciation.\n\nThese heteronyms represent a significant challenge for text-to-speech systems. Word sense disambiguation helps resolve such ambiguities by analyzing the surrounding context. The accuracy of this disambiguation directly affects the naturalness and intelligibility of the generated audio.\n\nChapter 4: Measuring Quality\n\nEvaluation of a PDF-to-audio pipeline requires measuring multiple dimensions of quality. Extraction accuracy captures how faithfully the text is pulled from the document. Speech quality measures how natural and intelligible the generated audio sounds. System reliability tracks whether the pipeline consistently produces correct results without failures.\n\nEach of these dimensions must be quantified using appropriate metrics. Word error rate measures textual accuracy at the word level. Layout F1-score captures structural fidelity. Real-time factor indicates processing speed relative to output duration. Together, these metrics provide a comprehensive view of system performance.\n\nConclusion\n\nThe future of digital reading lies in intelligent systems that can faithfully extract, understand, and vocalize written content. By measuring extraction accuracy, speech quality, and system reliability, we can continuously improve these tools for millions of users worldwide. The benchmark presented in this document provides a standardized foundation for such evaluation.`;

const NOISE_PATTERNS = ["benchmark document v1.0","confidential","page 1 of 3","page 2 of 3","page 3 of 3"];
const EXPECTED_STRUCTURE = [{role:"title",key:"the art of digital reading"},{role:"heading",key:"chapter 1: the evolution of text"},{role:"heading",key:"chapter 2: understanding document structure"},{role:"heading",key:"chapter 3: the science of speech"},{role:"heading",key:"chapter 4: measuring quality"},{role:"heading",key:"conclusion"}];
const BODY_KEYS = ["digital reading has transformed","history of written communication","johannes gutenberg in 1440","another inflection point","reading order, structural hierarchy","well-structured document contains","sidebar should not interrupt","converting text to speech requires","heteronyms represent a significant challenge","pdf-to-audio pipeline requires","word error rate measures","future of digital reading lies"];
const HETERONYMS = [{word:"read",context1:"i read books daily",context2:"i read that book yesterday"},{word:"tear",context1:"the tear in the fabric",context2:"a tear rolled down her cheek"}];

const EP = {
  health:["/health","/api/health","/api/v1/health","/status"],
  upload:["/api/v1/documents/upload","/api/documents/upload","/upload","/api/upload","/api/v1/upload","/api/extract","/extract"],
  text:id=>[`/api/v1/documents/${id}/text`,`/api/documents/${id}/text`,`/api/v1/documents/${id}`,`/documents/${id}/text`],
  stats:id=>[`/api/v1/documents/${id}/stats`,`/api/documents/${id}/stats`],
  ttsInfo:id=>[`/api/v1/documents/${id}/tts/info`,`/api/documents/${id}/tts/info`],
  ttsSeg:(id,i)=>[`/api/v1/documents/${id}/tts/segment/${i}`,`/api/documents/${id}/tts/segment/${i}`],
  voices:["/api/v1/tts/voices","/api/tts/voices","/tts/voices"],
  model:["/api/v1/model","/api/v1/info","/api/v1/config","/api/model","/api/info","/model","/info","/config"],
};

async function probe(base,paths,opts={}){
  const{method="GET",timeout=4000,body}=opts;
  for(const p of paths){try{
    const o={method,signal:AbortSignal.timeout(timeout)};
    if(body){o.body=body;if(!(body instanceof FormData))o.headers={"Content-Type":"application/json"};}
    const r=await fetch(`${base}${p}`,o);
    if(r.ok)return{path:p,data:await r.json()};
  }catch(e){}}return null;
}

function norm(t){return t.replace(/[\u201c\u201d\u2018\u2019]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();}

function calcF1(text){
  const l=norm(text);const sf=EXPECTED_STRUCTURE.filter(s=>l.includes(s.key));const bf=BODY_KEYS.filter(b=>l.includes(b));
  const np=NOISE_PATTERNS.filter(n=>l.includes(n));const nf=NOISE_PATTERNS.length-np.length;
  let os=0,li=-1;for(const s of EXPECTED_STRUCTURE){const i=l.indexOf(s.key);if(i>li&&i!==-1){os++;li=i;}}
  let bo=0;li=-1;for(const b of BODY_KEYS){const i=l.indexOf(b);if(i>li&&i!==-1){bo++;li=i;}}
  const tp=sf.length+bf.length+nf,fp=np.length,fn=(EXPECTED_STRUCTURE.length-sf.length)+(BODY_KEYS.length-bf.length);
  const p=tp/Math.max(1,tp+fp),r=tp/Math.max(1,tp+fn),f1=p+r>0?(2*p*r)/(p+r):0;
  return{f1:+(f1.toFixed(3)),precision:+(p.toFixed(3)),recall:+(r.toFixed(3)),structFound:sf.length,structTotal:EXPECTED_STRUCTURE.length,bodyFound:bf.length,bodyTotal:BODY_KEYS.length,noiseFiltered:nf,noiseTotal:NOISE_PATTERNS.length,noisePresent:np,orderScore:os,bodyOrderScore:bo,missingStructure:EXPECTED_STRUCTURE.filter(s=>!l.includes(s.key)).map(s=>s.key),missingBody:BODY_KEYS.filter(b=>!l.includes(b))};
}

function calcWER(ref,hyp){
  const r=norm(ref).split(/\s+/),h=norm(hyp).split(/\s+/),m=r.length,n=h.length;
  if(!m)return{wer:n?1:0,edits:0,refWords:0,hypWords:n};
  let prev=Array.from({length:n+1},(_,j)=>j),cur=new Array(n+1).fill(0);
  for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){const c=r[i-1]===h[j-1]?0:1;cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c);}[prev,cur]=[cur,prev];}
  return{wer:+(prev[n]/m).toFixed(4),edits:prev[n],refWords:m,hypWords:n};
}

function calcRTF(s,d){if(d<=0)return{rtf:0,rating:"N/A"};const r=s/d;return{rtf:+r.toFixed(3),rating:r>1?"Critical":r>.5?"Poor":r>.2?"Good":"Excellent"};}

function getTime(wb){return wb.time_ms??wb.audio_ms??wb.offset_ms??wb.time??wb.start??0;}

function calcMOS(wb, synthTime, audioDur, wordCount){
  // Try word boundary analysis first
  if(wb&&wb.length>=5){
    const iv=[];for(let i=1;i<wb.length;i++){const g=getTime(wb[i])-getTime(wb[i-1]);if(g>0)iv.push(g);}
    if(iv.length>=3){
      const mn=iv.reduce((a,b)=>a+b,0)/iv.length,sd=Math.sqrt(iv.reduce((s,v)=>s+(v-mn)**2,0)/iv.length),cv=mn>0?sd/mn:0;
      let rs=cv>=.3&&cv<=.7?4.5:cv>=.2&&cv<=.85?3.8:cv>=.1&&cv<=1?3:2;
      let ps=3;for(let i=0;i<wb.length-1;i++){const g=getTime(wb[i+1])-getTime(wb[i]);if(/[.!?,]$/.test(wb[i].text||"")&&g>mn*1.3)ps+=.15;}ps=Math.min(5,Math.max(1,ps));
      const td=(getTime(wb[wb.length-1])-getTime(wb[0]))/60000,wpm=td>0?wb.length/td:0;
      const ss=wpm>=120&&wpm<=180?4.5:wpm>=100&&wpm<=200?3.8:wpm>=80&&wpm<=220?3:2.5;
      const mos=Math.min(5,Math.max(1,+((rs*.4+ps*.35+ss*.25).toFixed(1))));
      return{mos,method:"word_boundary_analysis",details:{cv:+cv.toFixed(2),rhythmScore:rs,pauseScore:+ps.toFixed(1),speedScore:ss,wpm:Math.round(wpm)}};
    }
  }
  // Fallback: estimate from synthesis time, audio duration, and word count
  if(audioDur>0&&wordCount>0){
    const wpm=wordCount/(audioDur/60);
    const speedScore=wpm>=120&&wpm<=180?4.5:wpm>=100&&wpm<=200?3.8:wpm>=80&&wpm<=220?3:2.5;
    const rtf=synthTime>0?synthTime/audioDur:0;
    const rtfScore=rtf<.2?4.5:rtf<.5?3.8:rtf<1?3:2;
    const mos=Math.min(5,Math.max(1,+((speedScore*.6+rtfScore*.4).toFixed(1))));
    return{mos,method:"fallback_estimation",details:{wpm:Math.round(wpm),speedScore,rtfScore,rtf:+rtf.toFixed(3)}};
  }
  return{mos:0,method:"no_data",details:{}};
}

function calcWSD(text){const l=norm(text);let f=0,t=0;const d=HETERONYMS.map(h=>{t+=2;const c1=l.includes(h.context1),c2=l.includes(h.context2);if(c1)f++;if(c2)f++;return{word:h.word,context1Found:c1,context2Found:c2};});return{accuracy:t?+(f/t).toFixed(3):0,found:f,total:t,details:d};}
function hMean(v){const f=v.filter(x=>x>0);return f.length?+(f.length/f.reduce((s,x)=>s+1/x,0)).toFixed(3):0;}

// CUSTOM PDF EVALUATION - works with partial reference text
/** Find where the pasted reference text appears in the extracted text */
function findMatchRegion(refText,extText){
  const rn=norm(refText),en=norm(extText);
  const rWords=rn.split(/\s+/),eWords=en.split(/\s+/);
  if(rWords.length<3||eWords.length<3)return{matched:false};

  // Try finding first 6-8 words of reference in extracted text
  for(let grab=8;grab>=4;grab--){
    const needle=rWords.slice(0,grab).join(" ");
    const pos=en.indexOf(needle);
    if(pos>=0){
      // Found start. Count words before this position to get word offset
      const wordsBefore=en.slice(0,pos).split(/\s+/).filter(w=>w).length;
      const windowSize=Math.min(rWords.length+Math.ceil(rWords.length*0.15),eWords.length-wordsBefore);
      const matchedWords=eWords.slice(wordsBefore,wordsBefore+windowSize);
      return{matched:true,startWord:wordsBefore,matchedText:matchedWords.join(" "),matchedWords,refWords:rWords};
    }
  }

  // Fallback: try last 6 words
  for(let grab=6;grab>=4;grab--){
    const needle=rWords.slice(-grab).join(" ");
    const pos=en.indexOf(needle);
    if(pos>=0){
      const wordsAfter=en.slice(pos).split(/\s+/).filter(w=>w).length;
      const endWord=eWords.length-(eWords.length-en.slice(0,pos).split(/\s+/).filter(w=>w).length-wordsAfter);
      const startWord=Math.max(0,en.slice(0,pos).split(/\s+/).filter(w=>w).length-rWords.length);
      const matchedWords=eWords.slice(startWord,startWord+rWords.length+10);
      return{matched:true,startWord,matchedText:matchedWords.join(" "),matchedWords,refWords:rWords};
    }
  }
  return{matched:false,refWords:rWords,eWords};
}

/** WER on matched region */
function calcCustomWER(refText,extText){
  const region=findMatchRegion(refText,extText);
  if(!region.matched){
    // Full-text WER as fallback (comparing entire texts)
    const ref=norm(refText).split(/\s+/),hyp=norm(extText).split(/\s+/);
    const m=ref.length,n=hyp.length;
    if(!m)return{wer:n?1:0,edits:0,refWords:0,hypWords:n,matchMethod:"none"};
    let prev=Array.from({length:n+1},(_,j)=>j),cur=new Array(n+1).fill(0);
    for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){const c=ref[i-1]===hyp[j-1]?0:1;cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c);}[prev,cur]=[cur,prev];}
    return{wer:+(prev[n]/m).toFixed(4),edits:prev[n],refWords:m,hypWords:n,matchMethod:"full_text"};
  }

  // WER on matched window
  const ref=region.refWords,hyp=region.matchedWords;
  const m=ref.length,n=hyp.length;
  let prev=Array.from({length:n+1},(_,j)=>j),cur=new Array(n+1).fill(0);
  for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){const c=ref[i-1]===hyp[j-1]?0:1;cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+c);}[prev,cur]=[cur,prev];}
  return{wer:+(prev[n]/m).toFixed(4),edits:prev[n],refWords:m,hypWords:n,matchMethod:"region_matched"};
}

/** Auto-detect headings from reference text */
function detectHeadings(text){
  const lines=text.split(/\n+/).map(l=>l.trim()).filter(l=>l);
  if(lines.length<3)return[];
  const avgLen=lines.reduce((s,l)=>s+l.length,0)/lines.length;
  const headings=[];
  const headingPatterns=[
    /^chapter\s+[\divxlc]/i, /^part\s+[\divxlc]/i, /^section\s+\d/i,
    /^\d+[.)]\s+\w/i, /^\d+\.\d+\s+\w/i, /^[ivxlc]+[.)]\s+\w/i,
  ];
  for(const line of lines){
    const words=line.split(/\s+/).length;
    const isShort=line.length<avgLen*0.6&&words<=10;
    const matchesPattern=headingPatterns.some(p=>p.test(line));
    const isAllCaps=line===line.toUpperCase()&&/[A-Z]/.test(line)&&words<=10;
    const noEndPunct=!/[.,:;]$/.test(line);
    const startsCapital=/^[A-Z]/.test(line);

    if(matchesPattern||(isAllCaps&&words>=2)||(isShort&&noEndPunct&&startsCapital&&words>=2&&words<=12)){
      headings.push(line.toLowerCase());
    }
  }
  return headings;
}

/** Layout F1 for custom PDFs */
function calcCustomF1(refText,extText){
  const eLower=norm(extText);
  const headings=detectHeadings(refText);

  // Check which headings from reference appear in extracted text
  const foundHeadings=headings.filter(h=>eLower.includes(h));

  // Check reading order of found headings
  let orderScore=0,lastIdx=-1;
  for(const h of headings){
    const idx=eLower.indexOf(h);
    if(idx>lastIdx&&idx!==-1){orderScore++;lastIdx=idx;}
  }

  // Take key phrases from reference (sentences >10 words)
  const refSentences=refText.split(/[.!?]+/).map(s=>s.trim().toLowerCase()).filter(s=>s.split(/\s+/).length>8);
  const bodyKeys=refSentences.slice(0,15).map(s=>{const words=s.split(/\s+/);return words.slice(0,6).join(" ");});
  const bodyFound=bodyKeys.filter(b=>eLower.includes(b));

  // Common noise patterns to check
  const commonNoise=[/page\s+\d+\s+(of\s+\d+)?/gi,/^\d{1,4}$/gm,/all rights reserved/gi,/copyright/gi];
  let noiseFound=0;
  for(const p of commonNoise){if(p.test(extText))noiseFound++;}

  const tp=foundHeadings.length+bodyFound.length;
  const fn=(headings.length-foundHeadings.length)+(bodyKeys.length-bodyFound.length);
  const fp=noiseFound;
  const precision=tp/Math.max(1,tp+fp);
  const recall=tp/Math.max(1,tp+fn);
  const f1=precision+recall>0?(2*precision*recall)/(precision+recall):0;

  return{
    f1:+f1.toFixed(3),precision:+precision.toFixed(3),recall:+recall.toFixed(3),
    structFound:foundHeadings.length,structTotal:headings.length,
    bodyFound:bodyFound.length,bodyTotal:bodyKeys.length,
    noiseFiltered:0,noiseTotal:commonNoise.length,noisePresent:noiseFound>0?["detected noise in output"]:[],
    orderScore,bodyOrderScore:0,
    missingStructure:headings.filter(h=>!eLower.includes(h)),
    missingBody:bodyKeys.filter(b=>!eLower.includes(b)),
    detectedHeadings:headings,
    custom:true,
  };
}

/** WSD for custom PDFs - checks common heteronyms found in the reference */
const COMMON_HETERONYMS=["read","lead","tear","wind","bow","close","live","minute","object","present","record","refuse","desert","produce","project","subject","conduct","conflict","content","contract","convert","convict","defect","digest","discount","escort","excuse","export","impact","import","increase","insert","insult","permit","protest","rebel","recall","suspect","survey","upset"];

function calcCustomWSD(refText,extText){
  const rLower=norm(refText),eLower=norm(extText);
  const rSentences=refText.split(/[.!?]+/).map(s=>s.trim().toLowerCase()).filter(s=>s.length>10);

  // Find heteronyms that appear in the reference text
  const found=[];
  for(const word of COMMON_HETERONYMS){
    const contexts=rSentences.filter(s=>s.includes(word));
    if(contexts.length>=2){
      // Word appears in multiple sentences - potential heteronym usage
      const ctx1=contexts[0].split(/\s+/).slice(0,8).join(" ");
      const ctx2=contexts[1].split(/\s+/).slice(0,8).join(" ");
      found.push({word,ctx1,ctx2,
        ctx1Found:eLower.includes(ctx1),
        ctx2Found:eLower.includes(ctx2),
      });
    }else if(contexts.length===1){
      const ctx1=contexts[0].split(/\s+/).slice(0,8).join(" ");
      found.push({word,ctx1,ctx2:null,
        ctx1Found:eLower.includes(ctx1),
        ctx2Found:null,
      });
    }
  }

  if(found.length===0)return{accuracy:null,found:0,total:0,details:[],custom:true,note:"No heteronyms detected in reference"};

  let correct=0,total=0;
  const details=found.map(f=>{
    if(f.ctx1){total++;if(f.ctx1Found)correct++;}
    if(f.ctx2){total++;if(f.ctx2Found)correct++;}
    return{word:f.word,context1Found:f.ctx1Found,context2Found:f.ctx2Found};
  });

  return{accuracy:total>0?+(correct/total).toFixed(3):null,found:correct,total,details,custom:true};
}

const C={bg:"#060a10",sf:"#0d1320",cd:"#131c2e",bd:"#1e2d45",tx:"#e2e8f0",dm:"#8899b3",mt:"#5a6f8a",ac:"#38bdf8",gn:"#22c55e",am:"#f59e0b",rd:"#ef4444",pp:"#a78bfa",cn:"#22d3ee",pk:"#f472b6"};
const sc=(s,t=[.5,.8])=>s>=t[1]?C.gn:s>=t[0]?C.am:C.rd;

export default function App(){
  const[url,setUrl]=useState("");const[tmp,setTmp]=useState("");const[st,setSt]=useState("idle");const[err,setErr]=useState("");
  const[mi,setMi]=useState(null);const[mh,setMh]=useState([]);const[ep,setEp]=useState({});
  const[runs,setRuns]=useState([]);const[busy,setBusy]=useState(false);const[prog,setProg]=useState("");
  const[tab,setTab]=useState("dashboard");const[sel,setSel]=useState(null);const[tts,setTts]=useState(true);
  const[panel,setPanel]=useState("none"); // "none"|"benchmark_model"|"custom_ref"|"custom_model"
  const[refText,setRefText]=useState("");const[customFile,setCustomFile]=useState(null);
  const[formModel,setFormModel]=useState("");const[formExtractor,setFormExtractor]=useState("");const[formTts,setFormTts]=useState("");
  const cnt=useRef(0);
  const fileRef=useRef(null);

  useEffect(()=>{(async()=>{try{const d={ value: localStorage.getItem("bd") };if(d?.value){const p=JSON.parse(d.value);if(p.r){setRuns(p.r);cnt.current=p.r.length;}if(p.m)setMh(p.m);if(p.u){setUrl(p.u);setTmp(p.u);}if(p.r?.length)setSel(p.r[p.r.length-1]);if(p.fm)setFormModel(p.fm);if(p.fe)setFormExtractor(p.fe);if(p.ft)setFormTts(p.ft);}
  }catch(e){}})();},[]);
  const save=useCallback((r,m,u)=>{localStorage.setItem("bd",JSON.stringify({r:r??runs,m:m??mh,u:u??url,fm:formModel,fe:formExtractor,ft:formTts}));},[runs,mh,url,formModel,formExtractor,formTts]);

  const connect=useCallback(async u=>{
    if(!u)return;const b=u.replace(/\/+$/,"");setSt("checking");setErr("");setMi(null);setEp({});
    try{
      const h=await probe(b,EP.health);if(!h)throw new Error("No health endpoint. Check URL and CORS (add \"*\" to CORS_ORIGINS).");
      const disc={health:h.path};
      const mdl={name:h.data?.title||h.data?.name||"Unknown",version:h.data?.version||"-",ext:"Unknown",tts:"Unknown",at:new Date().toISOString(),raw:h.data};
      const inf=await probe(b,EP.model);
      if(inf?.data){if(inf.data.model)mdl.name=inf.data.model;if(inf.data.extraction_backend||inf.data.extractor||inf.data.pipeline)mdl.ext=inf.data.extraction_backend||inf.data.extractor||inf.data.pipeline;if(inf.data.tts_backend||inf.data.tts_engine)mdl.tts=inf.data.tts_backend||inf.data.tts_engine;disc.model=inf.path;mdl.raw={...mdl.raw,...inf.data};}
      const vc=await probe(b,EP.voices);
      if(vc?.data){disc.voices=vc.path;const vl=vc.data.voices||vc.data;if(Array.isArray(vl)&&vl.length){const id=(vl[0].id||"").toLowerCase();mdl.tts=id.includes("neural")?"Edge-TTS (Neural)":id.includes("openai")?"OpenAI TTS":id.includes("eleven")?"ElevenLabs":id.includes("coqui")?"Coqui":id.includes("piper")?"Piper":id.includes("bark")?"Bark":`Custom (${vl.length} voices)`;}}
      const rs=JSON.stringify(mdl.raw).toLowerCase();
      if(rs.includes("pymupdf")||rs.includes("fitz"))mdl.ext="PyMuPDF";else if(rs.includes("marker"))mdl.ext="Marker";else if(rs.includes("nougat"))mdl.ext="Nougat";else if(rs.includes("doctr"))mdl.ext="docTR";else if(rs.includes("unstructured"))mdl.ext="Unstructured";else if(rs.includes("surya"))mdl.ext="Surya";else if(rs.includes("tesseract"))mdl.ext="Tesseract";else if(rs.includes("paddle"))mdl.ext="PaddleOCR";else if(rs.includes("pdfplumber"))mdl.ext="pdfplumber";else if(rs.includes("pdf reader"))mdl.ext="PDF to Speech Pipeline";
      if(mdl.name==="Unknown")mdl.name=`Server @ ${new URL(b).host}`;
      setMi(mdl);setEp(disc);setUrl(b);setTmp(b);setSt("connected");
      setMh(p=>{const sig=`${mdl.name}|${mdl.ext}|${mdl.tts}`;if(p.some(x=>`${x.name}|${x.ext}|${x.tts}`===sig))return p;const n=[...p,mdl];save(null,n,b);return n;});
      save(null,null,b);
    }catch(e){setSt("error");setErr(e.message);}setProg("");
  },[save]);

  useEffect(()=>{if(url&&st==="idle")connect(url);},[url]);

  const getModelInfo=()=>({name:formModel||"Unknown",ext:formExtractor||"Unknown",tts:formTts||"Unknown",version:mi?.version||"-",at:new Date().toISOString()});

  const run=useCallback(async()=>{
    if(busy||st!=="connected")return;setBusy(true);setErr("");setPanel("none");
    const id=`RUN-${String(++cnt.current).padStart(4,"0")}`,res={id,ts:new Date().toISOString(),model:getModelInfo(),metrics:{},status:"running",remark:""};
    try{
      setProg("Uploading PDF...");const bin=atob(BENCHMARK_PDF_B64);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
      const fd=new FormData();fd.append("file",new Blob([a],{type:"application/pdf"}),"benchmark_test.pdf");
      const t0=performance.now();const up=await probe(url,EP.upload,{method:"POST",body:fd,timeout:30000});const lat=Math.round(performance.now()-t0);
      if(!up)throw new Error("Upload failed. Tried: "+EP.upload.join(", "));
      const did=up.data.id||up.data.document_id||up.data.doc_id;if(!did)throw new Error("No doc ID in response: "+JSON.stringify(up.data).slice(0,200));

      setProg("Fetching text...");const tr=await probe(url,EP.text(did));if(!tr)throw new Error("Cannot fetch text for "+did);
      const ext=tr.data.clean_text||tr.data.text||tr.data.content||tr.data.extracted_text||"";if(!ext)throw new Error("No text field. Keys: "+Object.keys(tr.data).join(", "));

      setProg("Stats...");const sr=await probe(url,EP.stats(did));

      setProg("Layout F1...");const f1=calcF1(ext);
      setProg("WER...");const wer=calcWER(REFERENCE_TEXT,ext);

      let rtf={rtf:0,rating:"N/A"},mos={mos:0,method:"skipped"},seg=null;
      if(tts){try{setProg("TTS eval...");const ti=await probe(url,EP.ttsInfo(did),{timeout:30000});
        if(ti?.data&&(ti.data.total_segments>0)){const sg=await probe(url,EP.ttsSeg(did,0),{method:"POST",body:JSON.stringify({voice_id:"en-US-AriaNeural",speed:1}),timeout:300000});
        if(sg?.data){seg={st:sg.data.synthesis_time,dur:sg.data.duration_seconds,wb:sg.data.word_boundaries?.length||0};rtf=calcRTF(sg.data.synthesis_time,sg.data.duration_seconds);const wc=ext.split(/\s+/).length;mos=calcMOS(sg.data.word_boundaries,sg.data.synthesis_time,sg.data.duration_seconds,wc);}}
      }catch(e){}}

      setProg("WSD...");const wsd=calcWSD(ext);
      const ea=Math.max(.01,1-wer.wer),tq=Math.max(.01,mos.mos>0?mos.mos/5:ea),suc=Math.max(.01,f1.f1>0?1:.5);
      res.metrics={s1:{f1,wer,lat},s2:{rtf,mos,wsd,seg},s3:{health:hMean([ea,tq,suc]),comp:{ea,tq,suc}}};
      res.stats=sr?.data;res.tt=Date.now()-new Date(res.ts).getTime();res.status="completed";
    }catch(e){res.status="failed";res.error=e.message;setErr(e.message);}
    setRuns(prev=>{const nr=[...prev,res];save(nr);return nr;});setSel(res);setBusy(false);setProg("");
    if(res.status==="completed"){setMh(p=>{const sig=`${formModel}|${formExtractor}|${formTts}`;if(p.some(x=>`${x.name}|${x.ext}|${x.tts}`===sig))return p;const n=[...p,getModelInfo()];return n;});}
  },[busy,st,url,runs,tts,save,formModel,formExtractor,formTts]);

  // Custom PDF upload handler
  const runCustom=useCallback(async(file)=>{
    if(busy||st!=="connected"||!file)return;setBusy(true);setErr("");setPanel("none");
    const hasRef=refText.trim().length>20;
    const id=`RUN-${String(++cnt.current).padStart(4,"0")}`,res={id,ts:new Date().toISOString(),model:getModelInfo(),metrics:{},status:"running",customPdf:file.name,hasReference:hasRef,remark:""};
    try{
      setProg("Uploading "+file.name+"...");
      const fd=new FormData();fd.append("file",file,file.name);
      const t0=performance.now();const up=await probe(url,EP.upload,{method:"POST",body:fd,timeout:60000});const lat=Math.round(performance.now()-t0);
      if(!up)throw new Error("Upload failed. Tried: "+EP.upload.join(", "));
      const did=up.data.id||up.data.document_id||up.data.doc_id;if(!did)throw new Error("No doc ID in response");

      setProg("Fetching text...");const tr=await probe(url,EP.text(did));if(!tr)throw new Error("Cannot fetch text for "+did);
      const ext=tr.data.clean_text||tr.data.text||tr.data.content||tr.data.extracted_text||"";if(!ext)throw new Error("No text in response");

      setProg("Stats...");const sr=await probe(url,EP.stats(did));
      const wordCount=ext.split(/\s+/).filter(w=>w).length;

      let f1,wer,wsd;
      if(hasRef){
        // Reference text provided - compute real metrics
        setProg("Computing Layout F1...");f1=calcCustomF1(refText,ext);
        setProg("Computing WER...");wer=calcCustomWER(refText,ext);
        setProg("Computing WSD...");wsd=calcCustomWSD(refText,ext);
      }else{
        // No reference - N/A
        f1={f1:null,precision:null,recall:null,structFound:0,structTotal:0,bodyFound:0,bodyTotal:0,noiseFiltered:0,noiseTotal:0,noisePresent:[],orderScore:0,bodyOrderScore:0,missingStructure:[],missingBody:[],custom:true};
        wer={wer:null,edits:null,refWords:null,hypWords:wordCount,custom:true};
        wsd={accuracy:null,found:0,total:0,details:[],custom:true};
      }

      let rtf={rtf:0,rating:"N/A"},mos={mos:0,method:"skipped"},seg=null;
      if(tts){try{setProg("TTS eval...");const ti=await probe(url,EP.ttsInfo(did),{timeout:30000});
        if(ti?.data&&(ti.data.total_segments>0)){const sg=await probe(url,EP.ttsSeg(did,0),{method:"POST",body:JSON.stringify({voice_id:"en-US-AriaNeural",speed:1}),timeout:300000});
        if(sg?.data){seg={st:sg.data.synthesis_time,dur:sg.data.duration_seconds,wb:sg.data.word_boundaries?.length||0};rtf=calcRTF(sg.data.synthesis_time,sg.data.duration_seconds);mos=calcMOS(sg.data.word_boundaries,sg.data.synthesis_time,sg.data.duration_seconds,wordCount);}}
      }catch(e){}}

      const ea=hasRef?Math.max(.01,1-(wer.wer||0)):null;
      const tq=Math.max(.01,mos.mos>0?mos.mos/5:.5);
      const suc=hasRef?(f1.f1>0?1:.5):1;
      const health=hasRef&&ea?hMean([ea,tq,suc]):(mos.mos>0?hMean([tq,suc]):null);
      res.metrics={s1:{f1,wer,lat,wordCount},s2:{rtf,mos,wsd,seg},s3:{health,comp:{ea,tq,suc}}};
      res.stats=sr?.data;res.tt=Date.now()-new Date(res.ts).getTime();res.status="completed";
    }catch(e){res.status="failed";res.error=e.message;setErr(e.message);}
    setRuns(prev=>{const nr=[...prev,res];save(nr);return nr;});setSel(res);setBusy(false);setProg("");
    if(fileRef.current)fileRef.current.value="";setCustomFile(null);
  },[busy,st,url,runs,tts,save,refText,formModel,formExtractor,formTts]);

  const xlsx=useCallback(()=>{
    const ok=runs.filter(r=>r.status==="completed");if(!ok.length)return;
    const rows=ok.map(r=>({
      "Run ID":r.id,"Time":r.ts,"Model":r.model?.name||"-","Extract":r.model?.ext||"-","TTS":r.model?.tts||"-","Server":url,
      "F1":r.metrics.s1.f1.f1,"Precision":r.metrics.s1.f1.precision,"Recall":r.metrics.s1.f1.recall,
      "WER":r.metrics.s1.wer.wer,"Edits":r.metrics.s1.wer.edits,"Latency(ms)":r.metrics.s1.lat,
      "RTF":r.metrics.s2.rtf.rtf,"RTF Rating":r.metrics.s2.rtf.rating,"MOS":r.metrics.s2.mos.mos,"MOS Method":r.metrics.s2.mos.method,
      "WSD":r.metrics.s2.wsd.accuracy,"Health":r.metrics.s3.health,
      "ExtractAcc":r.metrics.s3.comp.ea,"TTSQual":r.metrics.s3.comp.tq,
      "Noise":r.metrics.s1.f1.noiseFiltered+"/"+r.metrics.s1.f1.noiseTotal,
      "Remark":r.remark||"",
    }));
    const ws=XLSX.utils.json_to_sheet(rows);ws["!cols"]=Object.keys(rows[0]).map(k=>({wch:Math.max(k.length+2,12)}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Results");
    XLSX.writeFile(wb,`benchmark_${new Date().toISOString().slice(0,10)}.xlsx`);
  },[runs,url]);

  const clr=async()=>{setRuns([]);setSel(null);cnt.current=0;try{localStorage.removeItem("bd");}catch(e){}};
  const updateRemark=(runId,text)=>{setRuns(prev=>{const nr=prev.map(r=>r.id===runId?{...r,remark:text}:r);save(nr);return nr;});};
  const lat=sel?.status==="completed"?sel:runs.filter(r=>r.status==="completed").slice(-1)[0]||null;
  const me=lat?.metrics;

  const radar=me?[{m:"Layout F1",v:(me.s1.f1.f1??0)*100},{m:"WER(inv)",v:(1-(me.s1.wer.wer??0))*100},{m:"Speed",v:Math.min(100,me.s1.lat<1000?95:me.s1.lat<3000?70:40)},{m:"MOS",v:me.s2.mos.mos>0?me.s2.mos.mos/5*100:0},{m:"RTF",v:me.s2.rtf.rtf>0?Math.min(100,(1-me.s2.rtf.rtf)*100):0},{m:"WSD",v:(me.s2.wsd.accuracy??0)*100}]:[];
  const trend=runs.filter(r=>r.status==="completed").map(r=>({id:r.id,f1:r.metrics.s1.f1.f1??0,wer:r.metrics.s1.wer.wer??0,h:r.metrics.s3.health??0}));

  const S={root:{background:C.bg,color:C.tx,minHeight:"100vh",fontFamily:"'JetBrains Mono','SF Mono',monospace",fontSize:13}};

  return(<div style={S.root}>
    <div style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,padding:"16px 24px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20,fontWeight:800,color:C.ac}}>◆ PDF Benchmark</span>
          <Pill c={st==="connected"?C.gn:st==="checking"?C.am:C.mt}>{st==="connected"?"Connected":st==="checking"?"Probing...":st==="error"?"Error":"Not Connected"}</Pill>
        </div>
        {(formModel||formExtractor||formTts)&&<div style={{display:"flex",gap:12,fontSize:11,color:C.dm,flexWrap:"wrap"}}><span><b style={{color:C.ac}}>Model:</b> {formModel||"-"}</span><span><b style={{color:C.pp}}>Extract:</b> {formExtractor||"-"}</span><span><b style={{color:C.pk}}>TTS:</b> {formTts||"-"}</span></div>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14}}>
        <span style={{fontSize:11,color:C.mt,whiteSpace:"nowrap"}}>Server</span>
        <input value={tmp} onChange={e=>setTmp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&connect(tmp)} placeholder="http://localhost:3000 or https://your-server.com" style={{flex:1,background:C.cd,border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 14px",color:C.tx,fontSize:12,outline:"none",minWidth:200}}/>
        <button onClick={()=>connect(tmp)} disabled={st==="checking"||!tmp} style={{background:C.ac,color:"#000",border:"none",borderRadius:6,padding:"8px 20px",fontSize:12,fontWeight:700,cursor:st==="checking"?"wait":"pointer",opacity:tmp?.4:1}}>
          {st==="checking"?"⏳ Probing...":"Connect"}</button>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.dm,whiteSpace:"nowrap"}}>
          <input type="checkbox" checked={tts} onChange={e=>setTts(e.target.checked)} style={{accentColor:C.ac}}/>TTS</label>
      </div>
    </div>

    {err&&<div style={{background:`${C.rd}12`,borderBottom:`1px solid ${C.rd}44`,padding:"10px 24px",fontSize:11,color:C.rd}}>⚠ {err}</div>}

    <div style={{display:"flex",borderBottom:`1px solid ${C.bd}`,background:C.sf}}>
      {["dashboard","history","models"].map(t=><button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?`2px solid ${C.ac}`:"2px solid transparent",padding:"10px 22px",color:tab===t?C.ac:C.mt,fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"uppercase",letterSpacing:1.5}}>{t}</button>)}
      <div style={{flex:1}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 16px"}}>
        <button onClick={()=>setPanel(panel==="benchmark_model"?"none":"benchmark_model")} disabled={busy||st!=="connected"} style={{background:busy?C.bd:C.gn,color:busy?C.mt:"#000",border:"none",borderRadius:6,padding:"7px 20px",fontSize:12,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>
          {busy?`⏳ ${prog}`:"▶ Run Benchmark"}</button>
        <button onClick={()=>{setPanel(panel==="custom_ref"?"none":"custom_ref");setCustomFile(null);}} disabled={busy||st!=="connected"} style={{background:busy?C.bd:C.ac,color:busy?C.mt:"#000",border:"none",borderRadius:6,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>
          📄 Test Your PDF</button>
        <input ref={fileRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>{if(e.target.files?.[0])setCustomFile(e.target.files[0]);}}/>
        {runs.length>0&&<button onClick={xlsx} style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:6,padding:"7px 14px",color:C.gn,fontSize:12,fontWeight:600,cursor:"pointer"}}>⬇ Excel</button>}
      </div>
    </div>

    {/* Step 1: reference text + file picker */}
    {panel==="custom_ref"&&<div style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,padding:"16px 24px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{background:C.ac,color:"#000",borderRadius:"50%",width:22,height:22,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>1</span>
        <span style={{fontSize:12,fontWeight:700,color:C.ac}}>Upload PDF & Paste Reference Text</span>
      </div>
      <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div style={{flex:"1 1 400px"}}>
          <textarea value={refText} onChange={e=>setRefText(e.target.value)} placeholder={"Paste the correct text from your PDF here (copy from ebook, publisher, or trusted source).\n\nPaste a few pages - the tool finds this portion in the full extraction and compares.\n\nIf you skip this, only Latency / RTF / MOS will be measured."} style={{width:"100%",height:130,background:C.cd,border:`1px solid ${C.bd}`,borderRadius:8,padding:12,color:C.tx,fontSize:11,fontFamily:"inherit",resize:"vertical",outline:"none",lineHeight:1.6}}/>
          <div style={{fontSize:10,color:C.dm,marginTop:6}}>
            {refText.trim().length>20
              ?<span style={{color:C.gn}}>✓ {refText.trim().split(/\s+/).length} words - all 7 metrics will work</span>
              :<span style={{color:C.am}}>No reference - only Latency, RTF, MOS</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,paddingTop:4}}>
          <button onClick={()=>fileRef.current?.click()} style={{background:C.cd,border:`1px solid ${customFile?C.gn:C.bd}`,borderRadius:8,padding:"12px 24px",fontSize:12,fontWeight:600,cursor:"pointer",color:customFile?C.gn:C.dm,whiteSpace:"nowrap"}}>
            {customFile?`✓ ${customFile.name}`:"📁 Choose PDF File"}</button>
          <button onClick={()=>{if(customFile)setPanel("custom_model");}} disabled={!customFile} style={{background:customFile?C.gn:C.bd,color:customFile?"#000":C.mt,border:"none",borderRadius:8,padding:"12px 24px",fontSize:13,fontWeight:700,cursor:customFile?"pointer":"not-allowed",whiteSpace:"nowrap"}}>
            Next -> </button>
          <button onClick={()=>{setPanel("none");setRefText("");setCustomFile(null);}} style={{background:"transparent",border:`1px solid ${C.bd}`,borderRadius:6,padding:"6px 16px",color:C.dm,fontSize:11,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* Step 2: model info */}
    {panel==="custom_model"&&<div style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,padding:"16px 24px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{background:C.gn,color:"#000",borderRadius:"50%",width:22,height:22,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>2</span>
        <span style={{fontSize:12,fontWeight:700,color:C.gn}}>Configure Model Info</span>
        <span style={{fontSize:10,color:C.dm,marginLeft:8}}>📄 {customFile?.name} {refText.trim().length>20?`| ✓ ${refText.trim().split(/\s+/).length} words ref`:""}</span>
      </div>
      <ModelForm model={formModel} extractor={formExtractor} ttsName={formTts} setModel={setFormModel} setExtractor={setFormExtractor} setTts={setFormTts} history={mh}
        onRun={()=>{if(customFile&&formModel.trim()&&formExtractor.trim()&&formTts.trim()){save();runCustom(customFile);}}}
        onBack={()=>setPanel("custom_ref")}
        onCancel={()=>{setPanel("none");setRefText("");setCustomFile(null);}}
        runLabel="📄 Run Test"
        disabled={busy}/>
    </div>}

    {/* Model info for built-in benchmark */}
    {panel==="benchmark_model"&&<div style={{background:C.sf,borderBottom:`1px solid ${C.bd}`,padding:"16px 24px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
        <span style={{background:C.gn,color:"#000",borderRadius:"50%",width:22,height:22,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800}}>⚙</span>
        <span style={{fontSize:12,fontWeight:700,color:C.gn}}>Configure & Run Benchmark</span>
        <span style={{fontSize:10,color:C.dm,marginLeft:8}}>Built-in test PDF (all 7 metrics)</span>
      </div>
      <ModelForm model={formModel} extractor={formExtractor} ttsName={formTts} setModel={setFormModel} setExtractor={setFormExtractor} setTts={setFormTts} history={mh}
        onRun={()=>{if(formModel.trim()&&formExtractor.trim()&&formTts.trim()){save();run();}}}
        onCancel={()=>setPanel("none")}
        runLabel="▶ Start Benchmark"
        disabled={busy}/>
    </div>}

    <div style={{padding:24}}>
      {tab==="dashboard"&&(st!=="connected"?<Emp i="⚡" t="Connect your server" s="Enter your PDF extractor's URL above. Works with localhost, staging, or production servers."/>:!me?<Emp i="📊" t="Ready" s="Click ▶ Run Benchmark to evaluate."/>:
      <div>
        <div style={{display:"flex",gap:20,marginBottom:24,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 280px",background:C.cd,border:`1px solid ${C.bd}`,borderRadius:14,padding:28,textAlign:"center"}}>
            {lat?.customPdf&&<div style={{fontSize:10,color:C.ac,marginBottom:8,background:`${C.ac}15`,borderRadius:4,padding:"4px 8px",display:"inline-block"}}>📄 {lat.customPdf}</div>}
            <div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:3,marginBottom:10}}>System Health</div>
            <div style={{fontSize:60,fontWeight:900,color:me.s3.health!=null?sc(me.s3.health):C.mt,lineHeight:1}}>{me.s3.health!=null?(me.s3.health*100).toFixed(1):"-"}</div>
            <div style={{fontSize:11,color:C.dm,marginTop:4}}>{lat?.customPdf?"TTS metrics only (no reference text)":"Harmonic Mean"}</div>
            <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:18,fontSize:11}}>
              {[["Extract",me.s3.comp.ea],["TTS",me.s3.comp.tq],["Success",me.s3.comp.suc]].map(([l,v])=><div key={l}><span style={{color:C.mt}}>{l}:</span> <span style={{color:v!=null?sc(v):C.mt,fontWeight:700}}>{v!=null?`${(v*100).toFixed(1)}%`:"N/A"}</span></div>)}
            </div>
          </div>
          <div style={{flex:"1 1 340px",background:C.cd,border:`1px solid ${C.bd}`,borderRadius:14,padding:18}}>
            <div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:3,marginBottom:6}}>Radar</div>
            <ResponsiveContainer width="100%" height={230}>
              <RadarChart data={radar.map(r=>({metric:r.m,value:r.v}))} margin={{top:10,right:30,bottom:10,left:30}}>
                <PolarGrid stroke={C.bd}/><PolarAngleAxis dataKey="metric" tick={{fill:C.dm,fontSize:10}}/><PolarRadiusAxis angle={30} domain={[0,100]} tick={{fill:C.mt,fontSize:9}}/>
                <Radar dataKey="value" stroke={C.ac} fill={C.ac} fillOpacity={.15} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Stg t="Stage 1 - Extraction" s="PDF, Text" c={C.ac}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginBottom:28}}>
          <MC t="Layout F1" v={me.s1.f1.f1} f="p" c={C.ac} s={`P:${(me.s1.f1.precision*100).toFixed(1)}% R:${(me.s1.f1.recall*100).toFixed(1)}%`} d={[`Struct:${me.s1.f1.structFound}/${me.s1.f1.structTotal}`,`Body:${me.s1.f1.bodyFound}/${me.s1.f1.bodyTotal}`,`Noise:${me.s1.f1.noiseFiltered}/${me.s1.f1.noiseTotal}`,`Order:${me.s1.f1.orderScore}/${EXPECTED_STRUCTURE.length}`]}/>
          <MC t="WER" v={me.s1.wer.wer} f="pi" c={C.cn} s={`${me.s1.wer.edits} edits / ${me.s1.wer.refWords} words`} d={[`Hyp words: ${me.s1.wer.hypWords}`,`Lower = better`]}/>
          <MC t="Latency" v={me.s1.lat} f="ms" c={C.pp} s={me.s1.lat<1000?"Excellent":me.s1.lat<3000?"Acceptable":"Slow"} d={[`${me.s1.lat}ms upload+process`]}/>
        </div>

        <Stg t="Stage 2 - TTS" s="Text, Speech" c={C.pk}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginBottom:28}}>
          <MC t="MOS (Proxy)" v={me.s2.mos.mos} f="mos" c={C.pk} s={`Method: ${me.s2.mos.method}`} d={me.s2.mos.details?.cv!=null?[`CV:${me.s2.mos.details.cv}`,`WPM:${me.s2.mos.details.wpm}`,`Rhythm:${me.s2.mos.details.rhythmScore}`]:["TTS not run"]}/>
          <MC t="RTF" v={me.s2.rtf.rtf} f="rtf" c={C.am} s={`Rating: ${me.s2.rtf.rating}`} d={me.s2.seg?[`Synth:${me.s2.seg.st}s`,`Audio:${me.s2.seg.dur}s`,`Target:<0.2`]:["TTS not run"]}/>
          <MC t="WSD Accuracy" v={me.s2.wsd.accuracy} f="p" c={C.gn} s={`${me.s2.wsd.found}/${me.s2.wsd.total} contexts`} d={(me.s2.wsd.details||[]).map(d=>`"${d.word}": ${d.context1Found?"✓":"✗"}/${d.context2Found?"✓":"✗"}`)}/>
        </div>

        {me.s1.f1.noisePresent.length>0&&<div style={{background:`${C.rd}12`,border:`1px solid ${C.rd}33`,borderRadius:10,padding:16,marginBottom:24}}>
          <div style={{fontSize:12,fontWeight:700,color:C.rd,marginBottom:8}}>⚠ Unfiltered Noise</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{me.s1.f1.noisePresent.map((n,i)=><span key={i} style={{background:`${C.rd}18`,border:`1px solid ${C.rd}44`,borderRadius:4,padding:"3px 10px",fontSize:11,color:C.dm}}>"{n}"</span>)}</div>
        </div>}

        {trend.length>1&&<div style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:14,padding:20}}>
          <div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:3,marginBottom:12}}>Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke={C.bd}/><XAxis dataKey="id" tick={{fill:C.mt,fontSize:9}}/><YAxis domain={[0,1]} tick={{fill:C.mt,fontSize:9}}/>
              <Tooltip contentStyle={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,fontSize:11}}/><Legend wrapperStyle={{fontSize:10}}/>
              <Line dataKey="h" stroke={C.gn} strokeWidth={2} name="Health" dot={{r:3}}/><Line dataKey="f1" stroke={C.ac} strokeWidth={2} name="F1" dot={{r:3}}/><Line dataKey="wer" stroke={C.rd} strokeWidth={2} name="WER" dot={{r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        </div>}
        {lat&&<div style={{fontSize:10,color:C.mt,textAlign:"right",marginTop:16}}>Run: {lat.id}{lat.customPdf?` | 📄 ${lat.customPdf}`:""}{lat.metrics?.s1?.wordCount?` | ${lat.metrics.s1.wordCount} words`:""} | {new Date(lat.ts).toLocaleString()} | {lat.tt}ms</div>}
      </div>)}

      {tab==="history"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><span style={{fontSize:14,fontWeight:700}}>Runs ({runs.length})</span>
          {runs.length>0&&<button onClick={clr} style={{background:`${C.rd}12`,border:`1px solid ${C.rd}44`,borderRadius:4,padding:"4px 12px",color:C.rd,fontSize:11,cursor:"pointer"}}>Clear</button>}
        </div>
        {!runs.length?<Emp i="📋" t="No runs"/>:
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr style={{borderBottom:`1px solid ${C.bd}`}}>
          {["ID","Time","Model","Backend","F1","WER","Lat","RTF","MOS","WSD","Health","Remark",""].map(h=><th key={h} style={{padding:"10px 6px",textAlign:"left",color:C.mt,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:1}}>{h}</th>)}
        </tr></thead><tbody>
          {[...runs].reverse().map(r=>{const ok=r.status==="completed",rm=r.metrics;return(
            <tr key={r.id} onClick={()=>setSel(r)} style={{borderBottom:`1px solid ${C.bd}15`,background:sel?.id===r.id?`${C.ac}0a`:"none",cursor:"pointer"}}>
              <td style={{padding:"8px 6px",fontWeight:700,color:C.ac}}>{r.id}</td>
              <td style={{padding:"8px 6px",color:C.dm}}>{new Date(r.ts).toLocaleTimeString()}</td>
              <td style={{padding:"8px 6px",color:C.dm,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis"}}>{r.model?.name||"?"}</td>
              <td style={{padding:"8px 6px",color:C.pp,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis"}}>{r.model?.ext||"?"}</td>
              {ok?<>
                <td style={{padding:"8px 6px",color:rm.s1.f1.f1!=null?sc(rm.s1.f1.f1):C.mt}}>{rm.s1.f1.f1!=null?`${(rm.s1.f1.f1*100).toFixed(1)}%`:"N/A"}</td>
                <td style={{padding:"8px 6px",color:rm.s1.wer.wer!=null?sc(1-rm.s1.wer.wer):C.mt}}>{rm.s1.wer.wer!=null?`${(rm.s1.wer.wer*100).toFixed(2)}%`:"N/A"}</td>
                <td style={{padding:"8px 6px",color:C.dm}}>{rm.s1.lat}ms</td>
                <td style={{padding:"8px 6px",color:C.dm}}>{rm.s2.rtf.rtf||"-"}</td>
                <td style={{padding:"8px 6px",color:C.dm}}>{rm.s2.mos.mos||"-"}</td>
                <td style={{padding:"8px 6px",color:rm.s2.wsd.accuracy!=null?sc(rm.s2.wsd.accuracy):C.mt}}>{rm.s2.wsd.accuracy!=null?`${(rm.s2.wsd.accuracy*100).toFixed(0)}%`:"N/A"}</td>
                <td style={{padding:"8px 6px",fontWeight:800,color:rm.s3.health!=null?sc(rm.s3.health):C.mt}}>{rm.s3.health!=null?(rm.s3.health*100).toFixed(1):"-"}</td>
              </>:<td colSpan={7} style={{padding:"8px 6px",color:C.rd}}>{r.error?.slice(0,80)||r.status}</td>}
              <td style={{padding:"4px 4px",minWidth:120}} onClick={e=>e.stopPropagation()}>
                <input value={r.remark||""} onChange={e=>updateRemark(r.id,e.target.value)} placeholder="Add note..." style={{width:"100%",background:"transparent",border:`1px solid ${C.bd}22`,borderRadius:4,padding:"4px 6px",color:C.dm,fontSize:10,outline:"none"}} onFocus={e=>e.target.style.borderColor=C.ac} onBlur={e=>e.target.style.borderColor=`${C.bd}22`}/>
              </td>
              <td><Pill c={ok?C.gn:C.rd}>{r.status}</Pill></td>
            </tr>);})}
        </tbody></table></div>}
        {runs.filter(r=>r.status==="completed").length>1&&<div style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:14,padding:20,marginTop:24}}>
          <div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:3,marginBottom:12}}>Health Comparison</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={runs.filter(r=>r.status==="completed").map(r=>({id:r.id,h:+(r.metrics.s3.health*100).toFixed(1)}))}><CartesianGrid strokeDasharray="3 3" stroke={C.bd}/><XAxis dataKey="id" tick={{fill:C.mt,fontSize:9}}/><YAxis domain={[0,100]} tick={{fill:C.mt,fontSize:9}}/>
              <Tooltip contentStyle={{background:C.sf,border:`1px solid ${C.bd}`,borderRadius:6,fontSize:11}}/><Bar dataKey="h" radius={[4,4,0,0]}>{runs.filter(r=>r.status==="completed").map((r,i)=><Cell key={i} fill={sc(r.metrics.s3.health)}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>}
      </div>}

      {tab==="models"&&<div>
        <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Model Detection</div>
        {mi&&<div style={{background:`${C.ac}08`,border:`1px solid ${C.ac}33`,borderRadius:12,padding:22,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:C.ac,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:C.gn,boxShadow:`0 0 8px ${C.gn}`,display:"inline-block"}}/>Active</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
            {[["Name",mi.name],["Version",mi.version],["Extraction",mi.ext],["TTS",mi.tts],["Detected",new Date(mi.at).toLocaleString()]].map(([l,v])=><div key={l}><div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:1}}>{l}</div><div style={{fontSize:12,fontWeight:500,marginTop:2}}>{v}</div></div>)}
          </div>
          {Object.keys(ep).length>0&&<div style={{marginTop:16,borderTop:`1px solid ${C.bd}`,paddingTop:12}}>
            <div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Endpoints Found</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{Object.entries(ep).filter(([_,v])=>typeof v==="string").map(([k,v])=><span key={k} style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:4,padding:"3px 10px",fontSize:10,color:C.dm}}><b style={{color:C.ac}}>{k}:</b> {v}</span>)}</div>
          </div>}
        </div>}
        <div style={{fontSize:12,fontWeight:600,color:C.dm,marginBottom:12}}>History ({mh.length})</div>
        {!mh.length?<Emp i="🔍" t="No models yet"/>:mh.map((m,i)=><div key={i} style={{background:C.cd,border:`1px solid ${C.bd}`,borderRadius:8,padding:14,marginBottom:8,display:"flex",flexWrap:"wrap",gap:14,fontSize:11,alignItems:"center"}}>
          <b style={{color:C.tx}}>{m.name}</b><span style={{color:C.dm}}>v{m.version}</span><span style={{color:C.pp}}>Extract: {m.ext}</span><span style={{color:C.pk}}>TTS: {m.tts}</span>
          <span style={{color:C.mt,marginLeft:"auto"}}>{new Date(m.at).toLocaleDateString()}</span>
        </div>)}
      </div>}
    </div>
  </div>);
}

function DropInput({value,onChange,placeholder,suggestions}){
  const[open,setOpen]=useState(false);
  const filtered=suggestions.filter(s=>s&&s.toLowerCase().includes(value.toLowerCase())&&s.toLowerCase()!==value.toLowerCase());
  return<div style={{position:"relative",width:"100%"}}>
    <input value={value} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)}
      placeholder={placeholder} style={{width:"100%",background:C.cd,border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 12px",color:C.tx,fontSize:12,outline:"none"}}/>
    {open&&filtered.length>0&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:C.cd,border:`1px solid ${C.bd}`,borderRadius:"0 0 6px 6px",zIndex:10,maxHeight:120,overflow:"auto"}}>
      {filtered.map((s,i)=><div key={i} onMouseDown={()=>{onChange(s);setOpen(false);}} style={{padding:"6px 12px",fontSize:11,color:C.dm,cursor:"pointer",borderBottom:`1px solid ${C.bd}22`}}
        onMouseEnter={e=>e.target.style.background=`${C.ac}15`} onMouseLeave={e=>e.target.style.background="transparent"}>{s}</div>)}
    </div>}
  </div>;
}

function ModelForm({model,extractor,ttsName,setModel,setExtractor,setTts,history,onRun,onBack,onCancel,runLabel,disabled}){
  const allModels=[...new Set(history.map(h=>h.name).filter(Boolean))];
  const allExtractors=[...new Set(history.map(h=>h.ext).filter(Boolean))];
  const allTts=[...new Set(history.map(h=>h.tts).filter(Boolean))];
  const ready=model.trim()&&extractor.trim()&&ttsName.trim();
  return<div>
    <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap",marginTop:10}}>
      <div style={{flex:"1 1 180px"}}>
        <label style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:4}}>Model Name</label>
        <DropInput value={model} onChange={setModel} placeholder="e.g. PDF to Speech v2" suggestions={allModels}/>
      </div>
      <div style={{flex:"1 1 180px"}}>
        <label style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:4}}>Extraction Backend</label>
        <DropInput value={extractor} onChange={setExtractor} placeholder="e.g. PyMuPDF, Marker" suggestions={allExtractors}/>
      </div>
      <div style={{flex:"1 1 180px"}}>
        <label style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:4}}>TTS Engine</label>
        <DropInput value={ttsName} onChange={setTts} placeholder="e.g. Edge-TTS, OpenAI" suggestions={allTts}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        {onBack&&<button onClick={onBack} style={{background:"transparent",border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 14px",color:C.dm,fontSize:11,cursor:"pointer"}}>← Back</button>}
        <button onClick={onRun} disabled={disabled||!ready} style={{background:ready?C.gn:C.bd,color:ready?"#000":C.mt,border:"none",borderRadius:8,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:ready?"pointer":"not-allowed",whiteSpace:"nowrap"}}>
          {runLabel}</button>
        <button onClick={onCancel} style={{background:"transparent",border:`1px solid ${C.bd}`,borderRadius:6,padding:"8px 14px",color:C.dm,fontSize:11,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
    {!ready&&<div style={{fontSize:10,color:C.am,marginTop:8}}>⚠ Fill all three fields to continue</div>}
  </div>;
}

function Stg({t,s,c}){return<div style={{marginBottom:14,display:"flex",alignItems:"baseline",gap:10}}><div style={{width:3,height:16,background:c,borderRadius:2}}/><span style={{fontSize:13,fontWeight:700}}>{t}</span><span style={{fontSize:11,color:C.mt}}>{s}</span></div>;}

function MC({t,v,f,c,s,d}){
  const[o,setO]=useState(false);let dv,dc;
  if(v===null||v===undefined){dv="N/A";dc=C.mt;s=s||"Custom PDF - no reference";}
  else if(f==="p"){dv=`${(v*100).toFixed(1)}%`;dc=sc(v);}
  else if(f==="pi"){dv=`${(v*100).toFixed(2)}%`;dc=sc(1-v);}
  else if(f==="ms"){dv=v<1000?`${v}ms`:`${(v/1000).toFixed(1)}s`;dc=v<1000?C.gn:v<3000?C.am:C.rd;}
  else if(f==="rtf"){dv=v>0?v.toFixed(3):"-";dc=v>0?(v<.2?C.gn:v<.5?C.am:C.rd):C.mt;}
  else if(f==="mos"){dv=v>0?`${v.toFixed(1)}/5`:"-";dc=v>=4?C.gn:v>=3?C.am:v>0?C.rd:C.mt;}
  else{dv=String(v);dc=C.tx;}
  return<div onClick={()=>setO(!o)} style={{background:C.cd,border:`1px solid ${C.bd}`,borderLeft:`3px solid ${c}`,borderRadius:10,padding:18,cursor:"pointer"}}>
    <div style={{fontSize:10,color:C.mt,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>{t}</div>
    <div style={{fontSize:30,fontWeight:900,color:dc,lineHeight:1,marginBottom:6}}>{dv}</div>
    <div style={{fontSize:10,color:C.dm}}>{s}</div>
    {o&&d&&<div style={{marginTop:12,borderTop:`1px solid ${C.bd}`,paddingTop:10}}>{d.map((x,i)=><div key={i} style={{fontSize:10,color:C.dm,lineHeight:1.8}}>{x}</div>)}</div>}
  </div>;
}

function Pill({c,children}){return<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:10,fontSize:10,fontWeight:600,background:`${c}18`,color:c,border:`1px solid ${c}33`}}><span style={{width:6,height:6,borderRadius:"50%",background:c,boxShadow:`0 0 6px ${c}`,display:"inline-block"}}/>{children}</span>;}
function Emp({i,t,s}){return<div style={{textAlign:"center",padding:"50px 20px"}}><div style={{fontSize:44,marginBottom:14}}>{i}</div><div style={{fontSize:15,fontWeight:600,marginBottom:6}}>{t}</div>{s&&<div style={{fontSize:12,color:C.mt,maxWidth:460,margin:"0 auto",lineHeight:1.7}}>{s}</div>}</div>;}
