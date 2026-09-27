package com.AozoraItsuki.NativePdf

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.sorareader.spec.NativePdfSpec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NativePdf(context: ReactApplicationContext) : NativePdfSpec(context) {
    @ReactMethod
    override fun parse(pdfFilePath: String, outputDirPath: String, promise: Promise) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = PdfParser.parse(pdfFilePath, outputDirPath)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PDF_PARSE_ERROR", e.message, e)
            }
        }
    }
}
