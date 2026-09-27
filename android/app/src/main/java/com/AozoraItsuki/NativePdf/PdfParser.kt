package com.AozoraItsuki.NativePdf

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileOutputStream

/** One page of a PDF: its text layer and the PNG render of the page box. */
data class PdfPage(val pageNumber: Int, val text: String, val imagePath: String)

data class PdfMetadata(
    val title: String = "",
    val author: String = "",
    var cover: String = "",
    val pages: MutableList<PdfPage> = mutableListOf(),
)

object PdfParser {
    /**
     * Raster scale applied to the page box before rendering. A PDF page is
     * sized in points (1/72"), so this turns a 612x792pt US Letter page into
     * a 918x1188px bitmap -- sharp on a 2x-3x phone screen.
     */
    private const val RENDER_SCALE = 1.5f

    /**
     * Longest bitmap edge we are willing to allocate. Real pages never reach
     * this; it only stops a hand-crafted page box from asking for a bitmap
     * that takes the process down with it.
     */
    private const val MAX_BITMAP_DIMENSION = 4096

    /**
     * `PdfRenderer` gained a text layer in API 35. Below that a page can only
     * be rasterized, so the text layer is empty and the import is image-only
     * (page renders are still produced, so the novel remains fully readable).
     *
     * NOTE: extracting the document info dictionary (real title/author) needs
     * a PDF parser the platform does not ship. If that metadata matters, add
     *   implementation 'com.tom-roush:pdfbox-android:2.0.27.0'
     * to android/app/build.gradle and read PDDocumentInformation here. Until
     * then the JS side falls back to the picked filename for the novel name.
     */

    /**
     * Main entry point: rasterize a PDF and return a WritableMap compatible
     * with the React Native bridge.
     */
    fun parse(pdfFilePath: String, outputDirPath: String): WritableMap {
        val metadata = parsePdf(pdfFilePath, outputDirPath)
        return metadataToWritableMap(metadata)
    }

    private fun parsePdf(pdfFilePath: String, outputDirPath: String): PdfMetadata {
        val pdfFile = File(pdfFilePath)
        if (!pdfFile.exists() || !pdfFile.isFile) {
            throw RuntimeException("Failed to read PDF file \"$pdfFilePath\"")
        }

        val outputDir = File(outputDirPath)
        if (!outputDir.exists() && !outputDir.mkdirs()) {
            throw RuntimeException("Failed to create PDF output directory \"$outputDirPath\"")
        }

        val metadata = PdfMetadata()

        // PdfRenderer needs a seekable descriptor and only allows one page to
        // be open at a time, so every page is opened, read and closed before
        // the next one is touched.
        val descriptor =
            ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
        try {
            val renderer = PdfRenderer(descriptor)
            try {
                for (index in 0 until renderer.pageCount) {
                    val page = renderer.openPage(index)
                    val text: String
                    val imagePath: String
                    try {
                        text = extractPageText(page)
                        imagePath = renderPageToPng(
                            page,
                            File(outputDir, "page-${index + 1}.png"),
                        )
                    } finally {
                        page.close()
                    }

                    metadata.pages.add(PdfPage(index + 1, text, imagePath))
                    if (index == 0) {
                        metadata.cover = imagePath
                    }
                }
            } finally {
                renderer.close()
            }
        } finally {
            descriptor.close()
        }

        return metadata
    }

    /**
     * Text layer of a page, one entry per text run.
     *
     * A page with no text layer (a scan) yields '', and a run that cannot be
     * read yields '' as well rather than failing the whole import.
     */
    private fun extractPageText(page: PdfRenderer.Page): String {
        // getTextContents() exists only on API 35+; below that the import is
        // image-only (guarded here rather than try/catch because the failure
        // mode is NoSuchMethodError, which must not be swallowed).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            return ""
        }
        return try {
            page.getTextContents()
                .map { it.text }
                .filter { it.isNotBlank() }
                .joinToString("\n")
        } catch (_: Exception) {
            ""
        }
    }

    /**
     * Render a page into `outputFile` as a PNG and return its absolute path.
     */
    private fun renderPageToPng(page: PdfRenderer.Page, outputFile: File): String {
        // A malformed page can report a zero-sized box; keep the bitmap legal.
        val pageWidth = page.width.coerceAtLeast(1)
        val pageHeight = page.height.coerceAtLeast(1)
        val longestEdge = maxOf(pageWidth, pageHeight)

        var scale = RENDER_SCALE
        if (longestEdge * scale > MAX_BITMAP_DIMENSION) {
            scale = MAX_BITMAP_DIMENSION.toFloat() / longestEdge
        }
        val width = (pageWidth * scale).toInt().coerceAtLeast(1)
        val height = (pageHeight * scale).toInt().coerceAtLeast(1)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
            // PdfRenderer composites onto a transparent bitmap, which the
            // reader would show as a black page.
            bitmap.eraseColor(Color.WHITE)

            val transform = Matrix()
            transform.postScale(scale, scale)
            page.render(bitmap, null, transform, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            FileOutputStream(outputFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
        } finally {
            bitmap.recycle()
        }

        return outputFile.absolutePath
    }

    /**
     * Convert PdfMetadata to a WritableMap for the React Native bridge.
     */
    private fun metadataToWritableMap(metadata: PdfMetadata): WritableMap {
        val map = Arguments.createMap()
        map.putString("title", metadata.title)
        map.putString("author", metadata.author)
        map.putString("cover", metadata.cover.ifEmpty { null })

        val pagesArray: WritableArray = Arguments.createArray()
        for (page in metadata.pages) {
            val pageMap = Arguments.createMap()
            pageMap.putInt("pageNumber", page.pageNumber)
            pageMap.putString("text", page.text)
            pageMap.putString("imagePath", page.imagePath)
            pagesArray.pushMap(pageMap)
        }
        map.putArray("pages", pagesArray)

        return map
    }
}
