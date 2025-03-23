import React from 'react';
import { useEbookStore } from '../store/useEbookStore';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChapterItem } from './ChapterItem';
import { Plus, Upload } from 'lucide-react';

export function ChapterList() {
  const { chapters, addChapter, reorderChapters } = useEbookStore();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddChapter = (type: 'frontmatter' | 'chapter' | 'backmatter' | 'toc') => {
    const defaultTitles = {
      frontmatter: 'Kata Pengantar',
      chapter: 'Bab Baru',
      backmatter: 'Penutup',
      toc: 'Daftar Isi'
    };

    addChapter({
      id: crypto.randomUUID(),
      title: defaultTitles[type],
      content: '',
      images: [],
      type,
      indentation: 0,
      lineSpacing: 1.5,
      subChapters: [],
    });
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = chapters.findIndex((chapter) => chapter.id === active.id);
      const newIndex = chapters.findIndex((chapter) => chapter.id === over.id);
      reorderChapters(arrayMove(chapters, oldIndex, newIndex));
    }
  };

  const processContent = (content: string): string => {
    // Replace triple newlines with double newlines
    let processedContent = content.replace(/\n{3,}/g, '\n\n');
    // Replace --- with double newlines
    processedContent = processedContent.replace(/---/g, '\n\n');
    return processedContent.trim();
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Sort files to ensure correct order
    files.sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath));

    const chaptersMap = new Map();
    let currentChapter: any = null;

    for (const file of files) {
      const content = await file.text();
      const pathParts = file.webkitRelativePath.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const folderName = pathParts.length > 2 ? pathParts[pathParts.length - 2] : null;

      if (!fileName.endsWith('.txt')) continue;

      const processedContent = processContent(content);

      if (fileName.toLowerCase() === 'kata pengantar.txt') {
        addChapter({
          id: crypto.randomUUID(),
          title: 'Kata Pengantar',
          content: processedContent,
          images: [],
          type: 'frontmatter',
          indentation: 0,
          lineSpacing: 1.5,
          subChapters: [],
        });
      } else if (fileName.toLowerCase() === 'penutup.txt') {
        addChapter({
          id: crypto.randomUUID(),
          title: 'Penutup',
          content: processedContent,
          images: [],
          type: 'backmatter',
          indentation: 0,
          lineSpacing: 1.5,
          subChapters: [],
        });
      } else if (folderName && folderName.startsWith('BAB')) {
        const chapterMatch = folderName.match(/BAB\s*(\d+)\s*-\s*(.*)/i);
        if (chapterMatch) {
          const chapterNumber = parseInt(chapterMatch[1]);
          const chapterTitle = chapterMatch[2].trim();

          if (!chaptersMap.has(chapterNumber)) {
            currentChapter = {
              id: crypto.randomUUID(),
              title: chapterTitle,
              content: '',
              images: [],
              type: 'chapter',
              indentation: 0,
              lineSpacing: 1.5,
              subChapters: [],
            };
            chaptersMap.set(chapterNumber, currentChapter);
          } else {
            currentChapter = chaptersMap.get(chapterNumber);
          }

          const subChapterMatch = fileName.match(/(\d+\.\d+)\s*(.*?)\.txt$/);
          if (subChapterMatch) {
            currentChapter.subChapters.push({
              id: crypto.randomUUID(),
              title: subChapterMatch[2].trim(),
              content: processedContent,
            });
          }
        }
      }
    }

    // Add chapters in order
    const sortedChapters = Array.from(chaptersMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, chapter]) => chapter);

    for (const chapter of sortedChapters) {
      addChapter(chapter);
    }

    // Reset input
    e.target.value = '';
  };

  const buttonClass = "w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500";

  // Group chapters by type
  const frontmatterChapters = chapters.filter(ch => ch.type === 'frontmatter');
  const tocChapters = chapters.filter(ch => ch.type === 'toc');
  const mainChapters = chapters.filter(ch => ch.type === 'chapter');
  const backmatterChapters = chapters.filter(ch => ch.type === 'backmatter');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Daftar Konten</h3>
        <p className="mt-1 text-sm text-gray-500">
          Kelola konten buku Anda termasuk kata pengantar, daftar isi, bab-bab, dan penutup.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className={buttonClass + " cursor-pointer"}>
          <Upload className="w-4 h-4 mr-2" />
          Bulk Upload
          <input
            type="file"
            className="hidden"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleBulkUpload}
          />
        </label>

        <button
          onClick={() => handleAddChapter('frontmatter')}
          className={buttonClass}
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Kata Pengantar
        </button>

        <button
          onClick={() => handleAddChapter('toc')}
          className={buttonClass}
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Daftar Isi
        </button>

        <button
          onClick={() => handleAddChapter('chapter')}
          className={buttonClass}
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Bab
        </button>

        <button
          onClick={() => handleAddChapter('backmatter')}
          className={buttonClass}
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Penutup
        </button>
      </div>

      <div className="space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={chapters.map((chapter) => chapter.id)}
            strategy={verticalListSortingStrategy}
          >
            {/* Render frontmatter chapters first */}
            {frontmatterChapters.map((chapter) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                index={chapters.indexOf(chapter)}
                isExpanded={false}
                onToggleExpand={() => {}}
              />
            ))}

            {/* Render table of contents */}
            {tocChapters.map((chapter) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                index={chapters.indexOf(chapter)}
                isExpanded={false}
                onToggleExpand={() => {}}
              />
            ))}

            {/* Render main chapters with automatic numbering */}
            {mainChapters.map((chapter, index) => (
              <ChapterItem
                key={chapter.id}
                chapter={{ ...chapter, pageNumber: index + 1 }}
                index={chapters.indexOf(chapter)}
                isExpanded={false}
                onToggleExpand={() => {}}
              />
            ))}

            {/* Render backmatter chapters last */}
            {backmatterChapters.map((chapter) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                index={chapters.indexOf(chapter)}
                isExpanded={false}
                onToggleExpand={() => {}}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}