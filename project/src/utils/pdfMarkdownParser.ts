import { jsPDF } from "jspdf";

interface TextStyle {
  bold: boolean;
  italic: boolean;
  heading: number | null;
  list: boolean;
  listType: 'ordered' | 'unordered' | null;
  listLevel: number;
  indentation: number;
}

interface TextSegment {
  text: string;
  style: TextStyle;
}

interface PDFMarkdownOptions {
  maxWidth: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  fontSize: number;
  lineHeight: number;
  font: string;
}

function applyStyle(doc: jsPDF, style: TextStyle, baseFontSize: number, font: string) {
  let fontStyle = 'normal';
  if (style.bold && style.italic) fontStyle = 'bolditalic';
  else if (style.bold) fontStyle = 'bold';
  else if (style.italic) fontStyle = 'italic';
  doc.setFont(font, fontStyle);

  if (style.heading) {
    const headingSizes = {
      1: baseFontSize * 2,
      2: baseFontSize * 1.5,
      3: baseFontSize * 1.17,
      4: baseFontSize * 1,
      5: baseFontSize * 0.83,
      6: baseFontSize * 0.67,
    };
    doc.setFontSize(headingSizes[style.heading]);
  } else {
    doc.setFontSize(baseFontSize);
  }
}

function parseInlineMarkdown(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let currentText = '';
  let currentStyle: TextStyle = {
    bold: false,
    italic: false,
    heading: null,
    list: false,
    listType: null,
    listLevel: 0,
    indentation: 0
  };

  let i = 0;
  while (i < text.length) {
    if (text[i] === '*' || text[i] === '_') {
      const marker = text[i];
      const isDouble = text[i + 1] === marker;

      if (currentText) {
        segments.push({ text: currentText, style: { ...currentStyle } });
        currentText = '';
      }

      if (isDouble) {
        currentStyle.bold = !currentStyle.bold;
        i += 2;
      } else {
        currentStyle.italic = !currentStyle.italic;
        i++;
      }
    } else {
      currentText += text[i];
      i++;
    }
  }

  if (currentText) {
    segments.push({ text: currentText, style: { ...currentStyle } });
  }

  return segments;
}

function calculateIndentation(text: string): number {
  let indentation = 0;
  
  const baseIndent = Math.floor((text.match(/^\s*/)?.[0].length || 0) / 2) * 0.25;
  indentation += baseIndent;
  
  const listMatch = text.match(/^(\s*(?:[-*]|\d+\.)\s+)/);
  if (listMatch) {
    indentation += 0.25;
  } else if (baseIndent > 0) {
    indentation += 0.75;
  } else if (text.trim().length > 0) {
    indentation += 0.25;
  }
  
  return indentation;
}

function renderJustifiedLine(
  doc: jsPDF,
  segments: TextSegment[],
  x: number,
  y: number,
  maxWidth: number,
  isLastLine: boolean
) {
  if (isLastLine || segments.length <= 1) {
    let currentX = x;
    segments.forEach(segment => {
      applyStyle(doc, segment.style, doc.getFontSize(), doc.getFont().fontName);
      doc.text(segment.text, currentX, y);
      currentX += doc.getTextWidth(segment.text + (segment.text === ' ' ? '' : ' '));
    });
    return;
  }

  let totalTextWidth = 0;
  let numberOfSpaces = segments.filter(s => s.text === ' ').length;
  segments.forEach(segment => {
    applyStyle(doc, segment.style, doc.getFontSize(), doc.getFont().fontName);
    totalTextWidth += doc.getTextWidth(segment.text);
  });

  const remainingSpace = Math.max(0, maxWidth - totalTextWidth);
  const extraSpacePerGap = numberOfSpaces > 0 ? remainingSpace / numberOfSpaces : 0;

  let currentX = x;
  segments.forEach((segment, index) => {
    applyStyle(doc, segment.style, doc.getFontSize(), doc.getFont().fontName);
    doc.text(segment.text, currentX, y);
    
    const segmentWidth = doc.getTextWidth(segment.text);
    currentX += segmentWidth;
    
    if (segment.text === ' ' && index < segments.length - 1) {
      currentX += extraSpacePerGap;
    }
  });
}

function splitWordIfNeeded(word: string, style: TextStyle, doc: jsPDF, maxWidth: number): TextSegment[] {
  const result: TextSegment[] = [];
  let currentPart = '';
  
  applyStyle(doc, style, doc.getFontSize(), doc.getFont().fontName);
  
  if (doc.getTextWidth(word) <= maxWidth) {
    return [{ text: word, style: { ...style } }];
  }
  
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    const testPart = currentPart + char;
    const testWidth = doc.getTextWidth(testPart);
    
    if (testWidth > maxWidth * 0.95) {
      if (currentPart.length >= 2) {
        result.push({ text: currentPart + '-', style: { ...style } });
        currentPart = char;
      } else if (currentPart.length > 0) {
        result.push({ text: currentPart, style: { ...style } });
        currentPart = char;
      } else {
        result.push({ text: char, style: { ...style } });
        currentPart = '';
      }
    } else {
      currentPart += char;
    }
  }
  
  if (currentPart.length > 0) {
    result.push({ text: currentPart, style: { ...style } });
  }
  
  return result;
}

function splitTextToLines(
  doc: jsPDF,
  segments: TextSegment[],
  maxWidth: number,
  baseIndentation: number = 0,
  font: string
): TextSegment[][] {
  const lines: TextSegment[][] = [[]];
  let currentLine = 0;
  let currentLineWidth = 0;
  let currentLineSegments: TextSegment[] = [];
  
  const indentationWidth = baseIndentation * doc.getFontSize();
  const availableWidth = maxWidth - indentationWidth;
  const spaceWidth = doc.getTextWidth(' ');
  
  function commitLine() {
    if (currentLineSegments.length > 0) {
      lines[currentLine] = [...currentLineSegments];
      currentLine++;
      lines[currentLine] = [];
      currentLineSegments = [];
      currentLineWidth = 0;
    }
  }
  
  segments.forEach(segment => {
    const words = segment.text.split(/\s+/);
    
    words.forEach((word, wordIndex) => {
      if (!word) return;
      
      applyStyle(doc, segment.style, doc.getFontSize(), font);
      const wordWidth = doc.getTextWidth(word);
      
      const totalWidth = currentLineWidth + 
        (currentLineSegments.length > 0 ? spaceWidth : 0) + 
        wordWidth;
      
      if (totalWidth <= availableWidth) {
        if (currentLineSegments.length > 0) {
          currentLineSegments.push({ text: ' ', style: segment.style });
          currentLineWidth += spaceWidth;
        }
        
        currentLineSegments.push({ text: word, style: segment.style });
        currentLineWidth += wordWidth;
      } else {
        if (wordWidth <= availableWidth) {
          commitLine();
          currentLineSegments.push({ text: word, style: segment.style });
          currentLineWidth = wordWidth;
        } else {
          if (currentLineSegments.length > 0) {
            commitLine();
          }
          
          const parts = splitWordIfNeeded(word, segment.style, doc, availableWidth);
          parts.forEach((part, index) => {
            if (index > 0) {
              commitLine();
            }
            
            currentLineSegments.push(part);
            currentLineWidth = doc.getTextWidth(part.text);
          });
        }
      }
    });
  });
  
  if (currentLineSegments.length > 0) {
    commitLine();
  }
  
  return lines
    .filter(line => line.length > 0)
    .map(line => {
      let lineWidth = 0;
      line.forEach(segment => {
        applyStyle(doc, segment.style, doc.getFontSize(), font);
        lineWidth += doc.getTextWidth(segment.text);
      });
      
      if (lineWidth > availableWidth) {
        const newLine: TextSegment[] = [];
        let currentWidth = 0;
        
        line.forEach(segment => {
          if (segment.text === ' ') {
            if (currentWidth + spaceWidth <= availableWidth) {
              newLine.push(segment);
              currentWidth += spaceWidth;
            }
            return;
          }
          
          const parts = splitWordIfNeeded(segment.text, segment.style, doc, availableWidth - currentWidth);
          parts.forEach(part => {
            if (currentWidth + doc.getTextWidth(part.text) <= availableWidth) {
              newLine.push(part);
              currentWidth += doc.getTextWidth(part.text);
            }
          });
        });
        
        return newLine;
      }
      
      return line;
    });
}

function formatPDFTableOfContents(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: PDFMarkdownOptions
): number {
  const lines = text.split('\n');
  let currentY = y;
  const lineHeight = options.fontSize * 0.352778 * options.lineHeight;
  const dotChar = '.';
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginRight = 20;
  const pageNumberWidth = 10;
  const dotSpacing = 2;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      currentY += lineHeight;
      continue;
    }

    const pageMatch = trimmedLine.match(/(?:- Halaman\s*)?(\d+|[ivxlcdm]+)$/i);
    const pageNumber = pageMatch ? pageMatch[1] : '';
    
    let content = pageMatch ? trimmedLine.slice(0, pageMatch.index).trim() : trimmedLine;
    content = content.replace(/- Halaman\s*$/, '').trim();

    let indent = 0;
    let title = content;
    let prefix = '';

    if (content.toLowerCase().startsWith('kata pengantar')) {
      doc.setFont(options.font, 'bold');
    } else if (content.match(/^Bab\s+\d+/i)) {
      doc.setFont(options.font, 'bold');
      const [chapter, ...titleParts] = content.split(/\s+(.+)/);
      prefix = chapter;
      title = titleParts.join(' ').trim();
    } else if (content.match(/^\d+\.\d+/)) {
      doc.setFont(options.font, 'normal');
      indent = 10;
      const [number, ...titleParts] = content.split(/\s+(.+)/);
      prefix = number;
      title = titleParts.join(' ').trim();
    } else {
      doc.setFont(options.font, 'normal');
    }

    const startX = x + indent;
    const contentWidth = pageWidth - startX - pageNumberWidth - marginRight;
    
    if (prefix) {
      doc.text(prefix, startX, currentY);
      doc.text(title, startX + 15, currentY);
    } else {
      doc.text(title, startX, currentY);
    }

    const titleWidth = prefix 
      ? doc.getTextWidth(prefix + '  ' + title)
      : doc.getTextWidth(title);
    const dotsStart = startX + titleWidth + 5;
    const dotsEnd = pageWidth - marginRight - pageNumberWidth;
    const dotWidth = doc.getTextWidth(dotChar);
    const numberOfDots = Math.floor((dotsEnd - dotsStart) / (dotWidth + dotSpacing));

    doc.setFont(options.font, 'normal');
    for (let i = 0; i < numberOfDots; i++) {
      doc.text(dotChar, dotsStart + i * (dotWidth + dotSpacing), currentY);
    }

    doc.text(pageNumber, pageWidth - marginRight - pageNumberWidth, currentY, { align: 'right' });

    currentY += lineHeight;

    if (content.match(/^Bab\s+\d+/i)) {
      currentY += lineHeight * 0.5;
    }
  }

  return currentY;
}

export function parsePDFMarkdown(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: PDFMarkdownOptions
): number {
  if (!text) return y;

  text = text.replace(/---/g, '\n');
  text = text.replace(/\n{2,}/g, '\n');

  if (text.includes('- Halaman') && 
      (text.includes('Bab') || text.includes('Kata Pengantar'))) {
    return formatPDFTableOfContents(doc, text, x, y, options);
  }

  doc.setFont(options.font, 'normal');
  doc.setFontSize(options.fontSize);

  const lineHeight = options.fontSize * 0.352778 * options.lineHeight;
  let currentY = y;
  const textLines = text.split('\n');

  const pageHeight = doc.internal.pageSize.getHeight();
  const marginBottom = 20;
  const maxY = pageHeight - marginBottom;

  for (let i = 0; i < textLines.length; i++) {
    let line = textLines[i];
    const baseIndentation = calculateIndentation(line);
    line = line.trim();
    
    if (!line) {
      currentY += lineHeight;
      continue;
    }

    if (currentY + lineHeight > maxY) {
      return currentY;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      
      currentY += lineHeight;
      if (currentY > maxY) return currentY;
      
      doc.setFontSize(options.fontSize * (2.5 - (level * 0.3)));
      doc.setFont(options.font, 'bold');
      
      const segments = parseInlineMarkdown(content);
      const lines = splitTextToLines(doc, segments, options.maxWidth, baseIndentation, options.font);
      
      lines.forEach((lineSegments, lineIndex) => {
        if (currentY > maxY) return;
        
        let xOffset = x + (baseIndentation * options.fontSize);
        
        if (options.align === 'justify') {
          renderJustifiedLine(
            doc,
            lineSegments,
            xOffset,
            currentY,
            options.maxWidth - (baseIndentation * options.fontSize),
            lineIndex === lines.length - 1
          );
        } else {
          let totalWidth = 0;
          lineSegments.forEach(segment => {
            applyStyle(doc, segment.style, options.fontSize, options.font);
            totalWidth += doc.getTextWidth(segment.text);
          });
          
          if (options.align === 'center') {
            xOffset = x + (options.maxWidth - totalWidth) / 2;
          } else if (options.align === 'right') {
            xOffset = x + options.maxWidth - totalWidth;
          }
          
          lineSegments.forEach(segment => {
            applyStyle(doc, segment.style, options.fontSize, options.font);
            doc.text(segment.text, xOffset, currentY);
            xOffset += doc.getTextWidth(segment.text);
          });
        }
        
        if (lineIndex < lines.length - 1) {
          currentY += lineHeight;
        }
      });
      
      doc.setFontSize(options.fontSize);
      doc.setFont(options.font, 'normal');
      continue;
    }

    const orderedListMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedListMatch) {
      const content = orderedListMatch[2];
      const listNumber = orderedListMatch[1];
      const listIndent = baseIndentation * options.fontSize;
      
      currentY += lineHeight;
      if (currentY > maxY) return currentY;
      
      doc.text(`${listNumber}.`, x + listIndent, currentY);
      const segments = parseInlineMarkdown(content);
      const lines = splitTextToLines(doc, segments, options.maxWidth - (listIndent + 5), baseIndentation, options.font);
      
      lines.forEach((lineSegments, lineIndex) => {
        if (currentY > maxY) return;
        
        let xOffset = x + listIndent + 5;
        
        if (options.align === 'justify') {
          renderJustifiedLine(
            doc,
            lineSegments,
            xOffset,
            currentY,
            options.maxWidth - (listIndent + 5),
            lineIndex === lines.length - 1
          );
        } else {
          let totalWidth = 0;
          lineSegments.forEach(segment => {
            applyStyle(doc, segment.style, options.fontSize, options.font);
            totalWidth += doc.getTextWidth(segment.text);
          });
          
          if (options.align === 'center') {
            xOffset = x + listIndent + 5 + (options.maxWidth - listIndent - 5 - totalWidth) / 2;
          } else if (options.align === 'right') {
            xOffset = x + options.maxWidth - totalWidth;
          }
          
          lineSegments.forEach(segment => {
            applyStyle(doc, segment.style, options.fontSize, options.font);
            doc.text(segment.text, xOffset, currentY);
            xOffset += doc.getTextWidth(segment.text);
          });
        }
        
        if (lineIndex < lines.length - 1) {
          currentY += lineHeight;
        }
      });
      continue;
    }

    const unorderedListMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedListMatch) {
      const content = unorderedListMatch[1];
      const listIndent = baseIndentation * options.fontSize;
      
      currentY += lineHeight;
      if (currentY > maxY) return currentY;
      
      doc.text('•', x + listIndent, currentY);
      const segments = parseInlineMarkdown(content);
      const lines = splitTextToLines(doc, segments, options.maxWidth - (listIndent + 5), baseIndentation, options.font);
      
      lines.forEach((lineSegments, lineIndex) => {
        if (currentY > maxY) return;
        
        let xOffset = x + listIndent + 5;
        
        if (options.align === 'justify') {
          renderJustifiedLine(
            doc,
            lineSegments,
            xOffset,
            currentY,
            options.maxWidth - (listIndent + 5),
            lineIndex === lines.length - 1
          );
        } else {
          let totalWidth = 0;
          lineSegments.forEach(segment => {
            applyStyle(doc, segment.style, options.fontSize, options.font);
            totalWidth += doc.getTextWidth(segment.text);
          });
          
          if (options.align === 'center') {
            xOffset = x + listIndent + 5 + (options.maxWidth - listIndent - 5 - totalWidth) / 2;
          } else if (options.align === 'right') {
            xOffset = x + options.maxWidth - totalWidth;
          }
          
          lineSegments.forEach(segment => {
            applyStyle(doc, segment.style, options.fontSize, options.font);
            doc.text(segment.text, xOffset, currentY);
            xOffset += doc.getTextWidth(segment.text);
          });
        }
        
        if (lineIndex < lines.length - 1) {
          currentY += lineHeight;
        }
      });
      continue;
    }

    currentY += lineHeight;
    if (currentY > maxY) return currentY;
    
    const segments = parseInlineMarkdown(line);
    const lines = splitTextToLines(doc, segments, options.maxWidth, baseIndentation, options.font);
    
    lines.forEach((lineSegments, lineIndex) => {
      if (currentY > maxY) return;
      
      let xOffset = x + (baseIndentation * options.fontSize);
      
      if (options.align === 'justify') {
        renderJustifiedLine(
          doc,
          lineSegments,
          xOffset,
          currentY,
          options.maxWidth - (baseIndentation * options.fontSize),
          lineIndex === lines.length - 1
        );
      } else {
        let totalWidth = 0;
        lineSegments.forEach(segment => {
          applyStyle(doc, segment.style, options.fontSize, options.font);
          totalWidth += doc.getTextWidth(segment.text);
        });
        
        if (options.align === 'center') {
          xOffset = x + (options.maxWidth - totalWidth) / 2;
        } else if (options.align === 'right') {
          xOffset = x + options.maxWidth - totalWidth;
        }
        
        lineSegments.forEach(segment => {
          applyStyle(doc, segment.style, options.fontSize, options.font);
          doc.text(segment.text, xOffset, currentY);
          xOffset += doc.getTextWidth(segment.text);
        });
      }
      
      if (lineIndex < lines.length - 1) {
        currentY += lineHeight;
      }
    });
  }

  return currentY;
}