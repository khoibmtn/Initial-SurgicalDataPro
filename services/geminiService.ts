import { GoogleGenAI } from "@google/genai";
import { ProcessedStats, Conflict } from '../types';

export const analyzeReport = async (stats: ProcessedStats, conflicts: Conflict[]): Promise<string> => {
  if (!process.env.API_KEY) {
    return "API Key is missing. Unable to generate AI insights.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash";

  // Summarize conflicts for the prompt to save tokens/complexity
  const conflictSummary = conflicts.slice(0, 20).map(c => 
    `${c.type} Conflict: ${c.resourceName} overlaps ${c.durationOverlap} mins between ${c.surgeryA} and ${c.surgeryB}`
  ).join('\n');

  const prompt = `
    Bạn là chuyên gia phân tích vận hành trong bệnh viện, phụ trách đánh giá hiệu quả hoạt động phòng phẫu thuật.

    QUY TẮC ĐÁNH GIÁ NGHIỆP VỤ:
    1. Về trùng giờ nhân viên:
    - Bác sĩ gây mê được phép tham gia TỐI ĐA 2 cuộc phẫu thuật tại cùng một thời điểm.
    - Chỉ khi bác sĩ gây mê tham gia từ 3 ca trở lên cùng thời điểm mới được xem là trùng giờ.
    - Tất cả các vị trí khác (PT chính, PT phụ, KTV gây mê, TDC, GV...) chỉ được phép tham gia 01 ca tại một thời điểm. Nếu từ 2 ca trở lên được xem là trùng giờ.

    2. Về thiếu mã máy:
    - Các ca phẫu thuật có tên kỹ thuật chứa chuỗi "[gây tê]" thì KHÔNG được xem là lỗi thiếu mã máy.

    DỮ LIỆU THỐNG KÊ:
    - Tổng số ca PTTT: ${stats.totalSurgeries}
    - Tổng thời gian thực hiện: ${stats.totalDurationMinutes} phút
    - Số trường hợp trùng giờ nhân viên: ${stats.staffConflicts}
    - Số ca trùng mã máy: ${stats.machineConflicts}
    - Số ca thiếu mã máy: ${stats.missingMachines}

    MỘT SỐ TRƯỜNG HỢP TRÙNG GIỜ TIÊU BIỂU:
    ${conflictSummary}

    YÊU CẦU PHÂN TÍCH:
    Hãy viết báo cáo bằng TIẾNG VIỆT, tuân thủ các quy tắc nghiệp vụ trên, gồm:

    1. Nhận định tổng quan về hoạt động PTTT.
    2. Đánh giá riêng:
      - Tình trạng trùng giờ nhân viên (có xét ngoại lệ bác sĩ gây mê).
      - Tình trạng thiếu mã máy (loại trừ các ca có "[gây tê]").
    3. Nhận định nguy cơ ảnh hưởng đến an toàn người bệnh.
    4. 3–5 khuyến nghị cải thiện công tác bố trí nhân sự và thiết bị.

    Yêu cầu trình bày:
    - Văn phong hành chính y khoa.
    - Gạch đầu dòng rõ ràng.
    - Độ dài tối đa 200 từ.
    `;



  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate AI analysis. Please check your API configuration.";
  }
};
