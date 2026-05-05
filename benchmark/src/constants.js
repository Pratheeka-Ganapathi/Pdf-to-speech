// Benchmark PDF embedded as base64 (3 pages, headers/footers/page numbers)
export const BENCHMARK_PDF_B64 = "JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgMTAgMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA5IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9Db250ZW50cyAxMSAwIFIgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXSAvUGFyZW50IDkgMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvbnRlbnRzIDEyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgOSAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNyAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDkgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9BdXRob3IgKFwoYW5vbnltb3VzXCkpIC9DcmVhdGlvbkRhdGUgKEQ6MjAyNjA0MDIwNjMwMTErMDAnMDAnKSAvQ3JlYXRvciAoXCh1bnNwZWNpZmllZFwpKSAvS2V5d29yZHMgKCkgL01vZERhdGUgKEQ6MjAyNjA0MDIwNjMwMTErMDAnMDAnKSAvUHJvZHVjZXIgKFJlcG9ydExhYiBQREYgTGlicmFyeSAtIFwob3BlbnNvdXJjZVwpKSAKICAvU3ViamVjdCAoXCh1bnNwZWNpZmllZFwpKSAvVGl0bGUgKFwoYW5vbnltb3VzXCkpIC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKOSAwIG9iago8PAovQ291bnQgMyAvS2lkcyBbIDQgMCBSIDUgMCBSIDYgMCBSIF0gL1R5cGUgL1BhZ2VzCj4+CmVuZG9iagoxMCAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMjI3Cj4+CnN0cmVhbQpHYXQ9KT8jTFpAJjpEZy1mTE4/UjAwNE1hbVRVPVlLbzcnSk1aYGZMbmIuKCtuJlIiRFVhaixDWmRiPkQpRDJSPE85KDZvUkBUYU9Qci1LZlI2UGdpb1diLmIlamRKU1daIUAiYEpnaENGQzJgWWtNPipkVjBtOGUvLlVqXkhzR01cOSJPcmhmQ0dSczw1NGpKYm9CTiopTFouc2dLc1wnXG9UcSpDYTNmPkBmLW0+SW9IJEhQXk4xQltPZEAkQTlpTSFsMVpoQU8qQz4qV2xHWEI/W2plNWNBVkxXVllnNnRlWENMQSlPYGslcldnInAwakUpY0cpOCwiTzQvKTRJRT9uMlxecFk1I3UsJFtyLGFMJzA/OyVANS9GXi45ciJfInFWXCtLaDNrWy1XaFZkXWVdK2JRWWguNGlCK0M3Wig1az42Yk9cPSQyUzgzaTpDaj1mZnNKPDopYS5BXkArRGxYXWQ8QztNV3Q6JF5TYVEnJDVDMVpUbElnMFJUZDFzL1goPzleX2VoLWM7Y15IKEEtTmpKKl5hQlsmVVlxUktiWFI3aEo4QkQ3QnNUKSlKWHNNOkNHZSVJR2JiJTg6ImVfPzdyWiUpLTJaMWpJV15BOD4pTzRzO2MqP1w+NG5fNl1mNzIxYiUmPlFYZDMjSnRoQSRIRnVTLytIKU8kJiReXGY9TTpJSidqZiZyWTBOIUVaXi9ULkNgMyNJV1AraGReKkVuYihVKmFhWjEyZEM9Tm1LO3UkZW0lLjYnVzksU0NPVydLPDlhUlQ5cmhTKmEtISd1aDRyKF5ZLmhTXVtLW0htXiNVJWM6YSFTNSshUU5FcmxFY0suQkxQInJabXJrTU9gY1U/SV4pU08pLFg/UWdHT2NsVjxRP2hNMDRPUyFWYSpPcGY2LGJkY2VBMXUkb2FjTFhQN28nWUlWXnUocVk+dCM4JjNvSy9ZXmMxM2E5X3JmJEU7Q1IpPHNvQEpYMjxwXEZfTlFqODMoanNpXUksZzA9JSMqb2lsNlBsKk4wNDYkZUBuYDglSyVERS84VUw3ZCdPSyFDN10vKkhybihOTHRWRCptO11QZj8tK1dUIzMqMlMiKlpjMyZcSylDR1tdSiE1K0k3WDM1b1RRKi5zOGMpTy06UFZfN2sjODtGNkU6VGA+KWlYYTRYNUJJSlguaT5RLixnU2hrUG8laW9xNjNeQ2tiLUdQV0A1N00oPiQyUlJhMzRBNmNNaTFbKSVqY1MvbW5lNyZqVDMvbF1WK29MQCZoPEolXi4rU0xFLk5YN25kQ0xwOWEudSk7OW5xMy8oJCMtNlAsKycrTikwYVQ3TUAjXUVjOS0pOV41aFZCJSpaO0pKZkYldT1ccyVpMypsSVdQVmpJQlxIaixFV0Q7NDdbJExQJitxMlIiUU9PKmU7Y2BxIjwscWA3MFohc3ReT2dfcEMlUjcuWGhoMTZcal8oZFEsKCgiPlcmc2VaO00sXGM5Z1lCP2w7QFBeRy5UWV1halhnZ285XyNQMl9SYlllUS01IjddXyMkYTduK25FXSNAKC1HXmxaQkUxWlVacz5aYG1MNSxRdDY8LCJzZS9lOjc9cyQoMGNJWkliUjVBZUFfSGg+Qy0jYW0sc1RUfj5lbmRzdHJlYW0KZW5kb2JqCjExIDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDEyMDIKPj4Kc3RyZWFtCkdhdFUxPyNTSWUmOkY1VT1RbWpZQ2R1b1VqTGovQE4jRHVNJ05XV0UsQyduVDNvODguOCNhXzljZzZkZyxoSSFjJ0YmQjNndGdZU2ZpYi4uYF9STSZrN3VEI01WXkxsUFlQbyJWS0EtSkJfQGNXWFktMXVxRFYmckVLX3NNa0svK0FoQ01RTnE6QklDK21sPkZUQCFIcTtDXThqUDlxcTVpTzhDK2siUi1yVE8iIkZKInRPUT41Y19tOlwmLEAxbXErKTZoOjJKP1FMN1FJZXA/cl1gJWJTYGFoKSpqdGlITG5SJzcpZFktdFVWQzE+UEBARWxHJ0hcdF9BbVhIXDMnS0xvSTd1SCJwJFE2VGwlNFxfTi1ZLT9xYmtwMDNndEdoXkosbEImJkslJ0NsV1IiImtWaC9FVWpQOCJvO14pMVxALkgqaG9ILVBeLnFzVjdrQ1RnKWkhVS5McnUhMippWU5haWc1czZJU3VELGRsXiJTakZrLTxLLk5SOFZCLFBvOlQ7YyJsPzhlNkQ6SkQxamdfXDFCLmVZaj9acDleQGFjbSQybCJOTzZXXWZHKSZhQCduQk9xV1o2IS9EMWtkRCJmRVZmQjhgJldNSnVvYWZsQDwiLEY+Zjo9R0FhLU4hOW9AWVZtPTtVa2BdI2QtSTE0bVRTZC1BXyxGNEk6X2dKXUcjT2YyOkQ6IkllS0lhLSVkVTYmPltpVztVLClIUk9VQ3AlQGRTOlsuTUlFOSRKMGVWVVZVS2NfXHVsKVBFalRIQmhLLkApaTFJT2Q+aDZuZ0dYVD5ydC8oQDJLWSQtdCMkITI1cm0zbFNPMjMrPVghZ25nS2szME8hMSIoQmZuYCFSYjRPIzg1dDdNMmAwa0duZ29aLFxtREQ4Mz4nMkZZLUltI0hecyZCWlghX2AxPWErMTgxbGc3PHRKZTlCJCVVaTBfRjUkOVxBJzE8Pks5NjYtPzFDK3BARjU7dHAwY3VMYWdtKWQvSipxbl9qaT9rbzJBKzheZkBMOFpJYEMiVlE6VVFGNHElaSUtclxNWElHTkdESmlXQUVdL1ZBY0gmSWRfYDJeJCs9Rio7QSVNL1I0bTRgcEMhUFZvJDNPZGx1X1owOlciRT8lTG9oTXRHSURmPEhPPkUqSz1PTm82R0JQQCNUW3RsZVRcIjNyI0ZHbFspUnUvTEpbUiJGaWVrIk1RcDU4Uj9kUlA6ImJgPS0sTWJrcS9sRTFcKCpLTFBdLVhMakErbydEUzY7T1VaPXVfTUksPz9wc20rUFdSOj9BODJsR1BNVENNLC45TShbQF4obGYnPjJjUEJcXVRkRlUtZyciLVxhJD89PjpOQzdeU14hPylSZFJSIjAvSWM9UWc0O21TRmpUNC4/VmxlN1dFRjdDcycnXGxaTyskVyxoKTxYZFlmU3JFIylRKVJJa0xCKlJBKTkjZ25QO251T21UdXJlWVZLPmhyc0BNMU8qYWxJS1FHQCNJaWMlMEZnPDg6Y2YqMF4yXVZJPSFCPj0nSkdNQldYNUw0PkJQQV0+R0dQI0ZCV1gwQjteXl1KMEsuQTs5N29xaVJSNVxvOSRrTmYma285Ln4+ZW5kc3RyZWFtCmVuZG9iagoxMiAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCAxMDQ2Cj4+CnN0cmVhbQpHYXQ9KWdNWWI4JjpPOlNiYkpDYE4yVHRBXj1CSWwiRTtoYy0uKGlKRVtZaDNqTy9DO1U0Lk86Tz5KMURKSEgjVixbbVo4RiJUOERTRT4oWHJPWnMnREAxXXJiOi1kcDssUCdNPGBJbCc/I2ZDWjBnPTo1S0JtPjBTbklBN0lfRWtmamVxIlpLbVo6PF06Y1dLPlxXRW1MMElxQmIoJDltVmMxS01VZExgdUoiYmsvLlhpLFJaWzhgaVNoMWM1bDEyR041T0A3YWhMLWcvcyprIkgpaU8pRT5IX14jcjtOSkYxRy1eS1pvbjZdLWBFSCMhSVZWODlcbldLaE9kIXA1LFhaUl4iRnRjaGhfJ0g+ZFJrUFgmVHRoZSo4bWdLMmtKIVshVlk2UFZyIidYT3JHT1Mpb15SPm4/VWk2SmVXRW1kJltMUFlFVkdmODpWPCspY0ApZDlXX04pRnBAX2ZVQSxKbzQnUEkiI1VhaS1KPCZuYj5dRDQqPDZXUmlHa05aNGBTMEpxXCRUakkwJDBlX1k0XlhCTThKL10tQz11YDRBUmxTZ2AvYE9oWDo+Sk5CPD84WDRLb0lwUy9HQihVO2ZYUXVrJD1FMSxwSyFsIWlQVTRrR0FENSxVUl88dEg+Q2tMTGI/ZFcxJWwvYzFEJkU+JCRCWjlgWzczPEhGMm9xJl9yajsqUks7Pm5QZlhtU2tscyokI1JSJkdBXlh0W1NiSzMxY2lUYFM8TighZ01IaFlnWmUqVzFEZ2pIOVYvJlgncjUsZE5STTZyL1lmLCFbO10wN0U2IjNlNihqRmlQJVFHPD1kNGpRJWs9XTpRU0w8ckFFYWM3VTY6dF9VO2tiYzhTZkhqZGpURjdybWFYbyRtZGRDWTBESz5IK284IWlHVWNZX282MHFmUStgJXQlXG4rSyFSbT8oSzEkOGRAO083TlRFUnBvJEN1Ti9XL2FdUzZhW1EyZFZCXjhEVm8oYSlwQzpqZCMvVUYiMC8tWFs7LmhMWzkqVTZLQWlTLShrdVlkZk42P1dXbiUjbkBaL2M0Tk9ydTY5cDNuPmkyYnU0bGVuOF9HTUFmVixaUEsvNzhcbVJMYlJZay5gRmVrQCZkcT1xMmhGNVcoK1FbJyVPIUZUMiRGU0d0Ky86cCohblJBczk+UEJFdEZpTVo5QFpdU1chXFI+ZmRabSo0ZDJGNz9YWEBGY2ZgaEFxQXNlZHExNkFoJWRZUVNVW0M6SldJLTJSc01lY25sQGJPNTFuS1pbaVovMiRXV2tyS0lBXjk6c3IvTSJvQEZwIi8mRlIvVFAkJi06IVhbS2w8K08uUSdrO3JcIiY6QEVjKSxyQisxYVZHYVBXPiNnK0NlKyQmQVJAPi0/MlA0KDNCMXB+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEzCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMTAyIDAwMDAwIG4gCjAwMDAwMDAyMDkgMDAwMDAgbiAKMDAwMDAwMDMyMSAwMDAwMCBuIAowMDAwMDAwNTE1IDAwMDAwIG4gCjAwMDAwMDA3MDkgMDAwMDAgbiAKMDAwMDAwMDkwMyAwMDAwMCBuIAowMDAwMDAwOTcxIDAwMDAwIG4gCjAwMDAwMDEyNTEgMDAwMDAgbiAKMDAwMDAwMTMyMiAwMDAwMCBuIAowMDAwMDAyNjQxIDAwMDAwIG4gCjAwMDAwMDM5MzUgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8Yjc2NjdhNWYwNDU5NGM0MjMzNDY0MDUwMDhhNjljMmI+PGI3NjY3YTVmMDQ1OTRjNDIzMzQ2NDA1MDA4YTY5YzJiPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA4IDAgUgovUm9vdCA3IDAgUgovU2l6ZSAxMwo+PgpzdGFydHhyZWYKNTA3MwolJUVPRgo=";

// Reference text - what a PERFECT extraction produces
// (no headers, no footers, no page numbers, correct order)
export const REFERENCE_TEXT = `The Art of Digital Reading

In the modern era, digital reading has transformed how we consume information. From academic papers to novels, the shift from physical to digital media has been profound and far-reaching. This document serves as a benchmark for evaluating PDF extraction systems.

Chapter 1: The Evolution of Text

The history of written communication spans thousands of years. Early civilizations used clay tablets and papyrus scrolls to record their knowledge. The invention of the printing press by Johannes Gutenberg in 1440 revolutionized the distribution of information across Europe and eventually the entire world.

Today, we find ourselves at another inflection point. Digital documents, particularly PDFs, have become the standard format for sharing written content across platforms and devices. The efficiency of modern text extraction systems determines how effectively this content can be repurposed for accessibility features like text-to-speech conversion.

The flow of information in a digital document must be preserved during extraction. Reading order, structural hierarchy, and semantic meaning all contribute to the fidelity of the final output. Without accurate extraction, downstream processes like audio generation will produce nonsensical results.

Chapter 2: Understanding Document Structure

A well-structured document contains several key elements that must be correctly identified by any extraction system. Headings provide hierarchical organization. Body text conveys the primary content. Footnotes offer supplementary information. Headers and footers contain metadata like page numbers and document titles.

The challenge for any extraction system is to correctly identify these elements and present them in the proper reading order. A sidebar should not interrupt a paragraph, and a page number should not appear in the middle of a sentence. Precision and recall of structural detection directly impact the quality of the extracted content.

Chapter 3: The Science of Speech

Converting text to speech requires understanding not just words, but context. Consider the word "read" in two different sentences. In "I read books daily" it is pronounced one way, while in "I read that book yesterday" it sounds entirely different. Similarly, "the tear in the fabric" differs from "a tear rolled down her cheek" in pronunciation.

These heteronyms represent a significant challenge for text-to-speech systems. Word sense disambiguation helps resolve such ambiguities by analyzing the surrounding context. The accuracy of this disambiguation directly affects the naturalness and intelligibility of the generated audio.

Chapter 4: Measuring Quality

Evaluation of a PDF-to-audio pipeline requires measuring multiple dimensions of quality. Extraction accuracy captures how faithfully the text is pulled from the document. Speech quality measures how natural and intelligible the generated audio sounds. System reliability tracks whether the pipeline consistently produces correct results without failures.

Each of these dimensions must be quantified using appropriate metrics. Word error rate measures textual accuracy at the word level. Layout F1-score captures structural fidelity. Real-time factor indicates processing speed relative to output duration. Together, these metrics provide a comprehensive view of system performance.

Conclusion

The future of digital reading lies in intelligent systems that can faithfully extract, understand, and vocalize written content. By measuring extraction accuracy, speech quality, and system reliability, we can continuously improve these tools for millions of users worldwide. The benchmark presented in this document provides a standardized foundation for such evaluation.`;

// Noise that a perfect extractor should REMOVE
export const NOISE_PATTERNS = [
  "benchmark document v1.0",
  "confidential",
  "page 1 of 3",
  "page 2 of 3",
  "page 3 of 3",
];

// Structural elements - titles and headings
export const EXPECTED_STRUCTURE = [
  { role: "title", key: "the art of digital reading" },
  { role: "heading", key: "chapter 1: the evolution of text" },
  { role: "heading", key: "chapter 2: understanding document structure" },
  { role: "heading", key: "chapter 3: the science of speech" },
  { role: "heading", key: "chapter 4: measuring quality" },
  { role: "heading", key: "conclusion" },
];

// Key body phrases to verify content completeness and reading order
export const BODY_KEYS = [
  "digital reading has transformed",
  "history of written communication",
  "johannes gutenberg in 1440",
  "another inflection point",
  "reading order, structural hierarchy",
  "well-structured document contains",
  "sidebar should not interrupt",
  "converting text to speech requires",
  "heteronyms represent a significant challenge",
  "pdf-to-audio pipeline requires",
  "word error rate measures",
  "future of digital reading lies",
];

// Heteronym test pairs (context preservation for WSD)
export const HETERONYMS = [
  { word: "read", context1: "i read books daily", context2: "i read that book yesterday" },
  { word: "tear", context1: "the tear in the fabric", context2: "a tear rolled down her cheek" },
];

// API endpoint patterns to try during auto-discovery
export const ENDPOINT_PATTERNS = {
  health: ["/health", "/api/health", "/api/v1/health", "/status", "/api/status"],
  upload: [
    "/api/v1/documents/upload", "/api/documents/upload",
    "/upload", "/api/upload", "/api/v1/upload",
    "/api/extract", "/api/v1/extract", "/extract",
  ],
  text: (id) => [
    `/api/v1/documents/${id}/text`, `/api/documents/${id}/text`,
    `/api/v1/documents/${id}`, `/documents/${id}/text`,
  ],
  stats: (id) => [
    `/api/v1/documents/${id}/stats`, `/api/documents/${id}/stats`,
  ],
  ttsInfo: (id) => [
    `/api/v1/documents/${id}/tts/info`, `/api/documents/${id}/tts/info`,
  ],
  ttsSegment: (id, idx) => [
    `/api/v1/documents/${id}/tts/segment/${idx}`,
    `/api/documents/${id}/tts/segment/${idx}`,
  ],
  voices: ["/api/v1/tts/voices", "/api/tts/voices", "/tts/voices"],
  modelInfo: [
    "/api/v1/model", "/api/v1/info", "/api/v1/config",
    "/api/model", "/api/info", "/model", "/info", "/config",
  ],
};
