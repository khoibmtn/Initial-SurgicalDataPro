import { ProcessedStats, Conflict } from '../types';
import { getEffectiveSlotConfig, getEffectiveProviderConfig } from './ai/aiConfigService';
import { generateAICompletion } from './ai/aiProviderClient';

export const analyzeReport = async (stats: ProcessedStats, conflicts: Conflict[]): Promise<string> => {
  const slotConfig = getEffectiveSlotConfig('conflict_insight');
  const providerConfig = getEffectiveProviderConfig(slotConfig.provider);

  if (!providerConfig.apiKey) {
    return "Chưa cấu hình API Key cho mô hình AI. Vui lòng vào mục Cấu hình → Cấu hình AI để thiết lập.";
  }

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
    - Độ dài tối đa 250 từ.
  `;

  try {
    const response = await generateAICompletion({
      providerConfig,
      modelId: slotConfig.modelId,
      temperature: slotConfig.temperature,
      reasoningEffort: slotConfig.reasoningEffort,
      maxTokens: slotConfig.maxTokens,
      messages: [
        { role: 'user', content: prompt }
      ],
    });
    return response.text || "Không tạo được nội dung phân tích.";
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return `Không thể tạo phân tích AI: ${error?.message || 'Vui lòng kiểm tra cấu hình API.'}`;
  }
};
