/**
 * AI Semantic Data Schema & Domain Knowledge Base
 * Mô tả toàn bộ cấu trúc dữ liệu, mối quan hệ liên kết giữa các bảng (ER Schema),
 * quy tắc nghiệp vụ y tế (Mùa Hè/Đông, Tua trực 24h, Gói dịch vụ, Phân chương PTTT)
 * và định nghĩa bộ công cụ truy vấn (Tools) cho AI.
 */

import { AppConfig } from '../../contexts/ConfigContext';
import { ChapterCatalog } from '../../types';
import { ServicePackageDefinition } from '../../types/servicePackage';

/**
 * Từ điển ngữ nghĩa chuyên khoa hỗ trợ mở rộng truy vấn tự nhiên
 * Ví dụ: khi user hỏi "phẫu thuật nội soi tiêu hóa", hệ thống vừa tìm theo từ khóa
 * vừa đối chiếu từ điển cơ quan giải phẫu & mã chương tiêu hóa.
 */
export const CLINICAL_DOMAIN_TAXONOMY: Record<
  string,
  {
    label: string;
    mustContainAny?: string[];
    organKeywords: string[];
    departmentHints: string[];
    chapterCodeHints: string[];
  }
> = {
  noi_soi_tieu_hoa: {
    label: 'Phẫu thuật / Thủ thuật Nội soi Tiêu hóa',
    mustContainAny: ['nội soi'],
    organKeywords: [
      'tiêu hóa',
      'ruột thừa',
      'dạ dày',
      'đại tràng',
      'trực tràng',
      'túi mật',
      'đường mật',
      'ống mật',
      'gan',
      'tụy',
      'lách',
      'thực quản',
      'tá tràng',
      'ruột non',
      'thoát vị',
      'ổ bụng',
      'viêm phúc mạc',
      'tắc ruột',
      'thủng tạng',
      'hậu môn',
      'trĩ',
    ],
    departmentHints: ['Ngoại TH'],
    chapterCodeHints: ['09', 'IX', '9'],
  },
  tieu_hoa: {
    label: 'Chuyên khoa Tiêu hóa - Gan mật',
    organKeywords: [
      'tiêu hóa',
      'ruột thừa',
      'dạ dày',
      'đại tràng',
      'trực tràng',
      'túi mật',
      'ống mật',
      'gan',
      'tụy',
      'thực quản',
      'tá tràng',
      'ruột',
      'thoát vị',
      'hậu môn',
      'trĩ',
      'rò hậu môn',
      'áp xe cạnh hậu môn',
    ],
    departmentHints: ['Ngoại TH'],
    chapterCodeHints: ['09', 'IX', '9'],
  },
  san_phu_khoa: {
    label: 'Chuyên khoa Sản - Phụ khoa',
    organKeywords: [
      'lấy thai',
      'mổ đẻ',
      'sản khoa',
      'tử cung',
      'buồng trứng',
      'vòi trứng',
      'chửa ngoài',
      'thai',
      'tầng sinh môn',
      'âm đạo',
      'cổ tử cung',
      'nhau',
      'rau',
      'sẩy thai',
      'nạo hút',
    ],
    departmentHints: ['Sản'],
    chapterCodeHints: ['13', '14', 'XIII', 'XIV'],
  },
  chan_thuong_chinh_hinh: {
    label: 'Chấn thương chỉnh hình (CTCH)',
    organKeywords: [
      'kết hợp xương',
      'gãy xương',
      'xương',
      'khớp',
      'dây chằng',
      'đứt gân',
      'nối gân',
      'tháo phương tiện',
      'đinh nội tủy',
      'nẹp vít',
      'bó bột',
      'cắt cụt',
      'chi trên',
      'chi dưới',
      'cẳng tay',
      'cẳng chân',
      'đùi',
      'cánh tay',
      'bàn tay',
      'bàn chân',
      'cột sống',
    ],
    departmentHints: ['CTCH'],
    chapterCodeHints: ['15', '16', 'XV', 'XVI'],
  },
  tai_mui_hong: {
    label: 'Tai Mũi Họng (TMH)',
    organKeywords: [
      'amidan',
      'nạo va',
      'vách ngăn',
      'xoang',
      'tai',
      'mũi',
      'họng',
      'thanh quản',
      'màng nhĩ',
      'dị vật hạ họng',
    ],
    departmentHints: ['TMH'],
    chapterCodeHints: ['06', '07', '08', 'VI', 'VII', 'VIII'],
  },
  mat: {
    label: 'Nhãn khoa (Mắt)',
    organKeywords: [
      'phaco',
      'thủy tinh thể',
      'mộng thịt',
      'quặm',
      'nhãn cầu',
      'giác mạc',
      'kết mạc',
      'mí mắt',
      'lệ đạo',
      'glôcôm',
    ],
    departmentHints: ['Mắt'],
    chapterCodeHints: ['05', 'V', '5'],
  },
  tiet_nieu: {
    label: 'Tiết niệu - Nam khoa',
    organKeywords: [
      'sỏi thận',
      'sỏi niệu quản',
      'sỏi bàng quang',
      'tán sỏi',
      'tiền liệt tuyến',
      'thận',
      'niệu quản',
      'bàng quang',
      'niệu đạo',
      'bao quy đầu',
      'tinh hoàn',
      'thừng tinh',
    ],
    departmentHints: ['Ngoại TH'],
    chapterCodeHints: ['10', '11', 'X', 'XI'],
  },
};

export interface AISemanticContextSummary {
  contextPage: 'daily_storage' | 'monthly_storage' | 'statistics_studio';
  periodLabel: string;
  dataSourceCitation?: string;
  loadedRecordCount: number;
  loadedDateRange: string;
  loadedPackageAssignmentsCount: number;
  loadedDutyScheduleDaysCount: number;
  staffCount: number;
  departments: string[];
  packageNames: string[];
  chapterSummary: string[];
  workingHoursText: string;
}

/**
 * Xây dựng System Prompt chuẩn Chuyên gia Phân tích Dữ liệu Bệnh viện (Medical Data Scientist)
 */
export function buildAISystemPrompt(
  summary: AISemanticContextSummary,
  config?: AppConfig,
  packages?: ServicePackageDefinition[],
  chapters?: ChapterCatalog[]
): string {
  const summer = config?.workingHours?.summer || {
    dateFrom: '01/05',
    dateTo: '30/09',
    morningFrom: '07:00',
    morningTo: '11:30',
    afternoonFrom: '13:30',
    afternoonTo: '17:00',
  };
  const winter = config?.workingHours?.winter || {
    dateFrom: '01/10',
    dateTo: '30/04',
    morningFrom: '07:30',
    morningTo: '12:00',
    afternoonFrom: '13:30',
    afternoonTo: '17:00',
  };

  const pkgListText =
    packages && packages.length > 0
      ? packages.map((p) => `- "${p.name}" (Tên tắt: "${p.shortName || p.name}", Giá gói: ${p.totalAmount.toLocaleString('vi-VN')}đ)`).join('\n')
      : summary.packageNames.map((n) => `- "${n}"`).join('\n') || '- Chưa có danh mục gói dịch vụ';

  const chapterListText =
    chapters && chapters.length > 0
      ? chapters.slice(0, 25).map((c) => `${c.ma_chuong}: ${c.ten_chuong}`).join(' | ')
      : summary.chapterSummary.join(' | ') || 'Theo chuẩn mã tương đương BHXH';

  return `Bạn là **Chuyên gia Phân tích Dữ liệu & Quản trị Vận hành Phẫu thuật (Medical Data Analyst AI)** của hệ thống **SurgicalDataPro** tại **${config?.hospitalName || 'Trung tâm Y tế Thủy Nguyên'}**.

## 1. KIẾN TRÚC CƠ SỞ DỮ LIỆU & MỐI QUAN HỆ LIÊN KẾT (RELATIONAL SCHEMA)
Hệ thống gồm 6 thực thể dữ liệu liên kết chặt chẽ với nhau:
1. **BẢNG CA PHẪU THUẬT / THỦ THUẬT (\`Surgeries\` / \`processed_records\`)**:
   - Định danh & Hành chính: \`patientId\` (Mã BN), \`patientName\` (Họ tên BN), \`gender\` (Giới tính), \`yob\` (Năm sinh), \`bhyt\` (Mã thẻ BHYT).
   - Thời gian: \`ngayCD\` (Ngày chỉ định), \`ngayBD\` (Thời điểm bắt đầu mổ ISO), \`ngayKT\` (Thời điểm kết thúc mổ ISO), \`timeMinutes\` (Thời lượng mổ tính bằng phút).
   - Chuyên môn & Tài chính: \`tenKT\` (Tên kỹ thuật PTTT), \`loaiPTTT\` (\`PĐB\`, \`P1\`, \`P2\`, \`P3\`, \`TĐB\`, \`T1\`, \`T2\`, \`T3\`, \`TKPL\`), \`soLuong\` (Số lượng quy đổi theo tỷ lệ thanh toán, ví dụ 1, 0.5, 0.8), \`maTuongDuong\` (Mã BHXH XX.XXXX.XXXX), \`donGia\` (Đơn giá DVKT VNĐ), \`thanhTien\` (Thành tiền viện phí VNĐ).
   - Kíp phẫu thuật (6 vị trí): \`ptChinh\` (PTV chính), \`ptPhu\` (PT phụ), \`bsGM\` (BS gây mê), \`ktvGM\` (KTV gây mê), \`tdc\` (Tít dụng cụ), \`gv\` (Giúp việc). *Lưu ý: Một vị trí có thể chứa nhiều nhân viên phân tách bằng dấu phẩy/chấm phẩy.*
   - Trang thiết bị: \`machine\` (Tên máy), \`machineCode\` (Mã máy).

2. **BẢNG GÓI DỊCH VỤ YÊU CẦU (\`ServicePackageAssignments\` & \`ServicePackageDefinitions\`)**:
   - Liên kết với bảng \`Surgeries\` qua khóa phức hợp \`compositeKey = patientId + ngayBD + tenKT\` hoặc \`linkedSurgeryKeys\`.
   - Lưu thông tin ca mổ đăng ký gói dịch vụ theo yêu cầu (VD: Gói DV yêu cầu sản khoa, Phẫu thuật chọn bác sĩ...), gồm: \`packageName\`, \`packageShortName\`, \`totalAmount\`, và danh sách nhân sự hưởng thù lao trong gói \`staffAssignments\` (bao gồm cả 6 vị trí trong mổ và các vị trí ngoài mổ như \`chuanBiPT\` - Chuẩn bị PT, \`hoSinhDonBe\` - Hộ sinh đón bé, \`nguoiTuVan\` - Người tư vấn).
   - Danh mục các gói dịch vụ hiện có:
${pkgListText}

3. **BẢNG LỊCH TRỰC 24H & QUY TẮC CHẤM NGOÀI GIỜ (\`DutySchedules\` & Tab \`Ngoài giờ\`)**:
   - Lưu tại Collection \`duty_schedules/{YYYY-MM-DD}\`: Mỗi ngày có \`date\` (YYYY-MM-DD), \`isHoliday\` (\`true\` = Thứ 7, CN, Ngày nghỉ lễ/tết; \`false\` = Ngày thường hành chính), và \`onCallStaff\` (Danh sách họ tên nhân viên trực 24h ngày đó).
   - **Quy tắc Tua trực 24h (Chuẩn phần mềm \`handleAutoFill24hShift\`)**: Tua trực 24h của ngày \`T\` bắt đầu từ giờ giao ban sáng ngày \`T\` (\`${summer.morningFrom}\` mùa Hè 16/04–15/10 hoặc \`${winter.morningFrom}\` mùa Đông 16/10–15/04) kéo dài xuyên đêm đến hết \`06:59\` (mùa Hè) hoặc \`07:29\` (mùa Đông) sáng ngày \`T+1\` (ví dụ: Tua trực ngày 20/10 bắt đầu từ \`20/10 07:30\` đến \`21/10 07:29\`). Do đó ca mổ diễn ra rạng sáng ngày \`T+1\` (trước giờ giao ban sáng) thuộc tua trực của ngày \`T\`.
   - **Quy tắc tính Chấm ngoài giờ (Tab \`Ngoài giờ\` trên BC Hàng ngày & BC Tháng)**:
     + Nhân viên có tên trong \`onCallStaff\` của phiên trực tương ứng thì **KHÔNG chấm ngoài giờ** (đã hưởng chế độ trực 24h).
     + Chỉ những nhân viên tham gia ca mổ mà **KHÔNG nằm trong danh sách trực 24h** và thời gian ca mổ rơi ra ngoài khung giờ hành chính (hoặc rơi vào ngày nghỉ \`isHoliday = true\`) mới phải chấm ngoài giờ.
     + Mặc định tính cho 5 vị trí chuyên môn (\`ptChinh\`, \`ptPhu\`, \`bsGM\`, \`ktvGM\`, \`tdc\`), và tính cả \`gv\` (Giúp việc) nếu cấu hình bật tính Giúp việc.
     + **Khung giờ chấm ngoài giờ (\`timeFrom\` → \`timeTo\`) & Phân loại (\`ghiChu\`)**:
       * \`Kíp tăng cường\`: Ca mổ vào ngày nghỉ/lễ/cuối tuần (\`isHoliday\`) hoặc bắt đầu hoàn toàn ngoài giờ hành chính (trước giờ sáng, trong giờ nghỉ trưa, hoặc sau giờ chiều). Chấm từ \`ngayBD\` đến \`ngayKT\`.
       * \`Kíp mổ phiên\`: Ca mổ ngày thường bắt đầu trong giờ hành chính nhưng kéo dài lố sang giờ nghỉ trưa (chấm từ \`morningTo\` đến \`ngayKT\`) hoặc kéo dài qua giờ tan làm chiều (chấm từ \`afternoonTo\` đến \`ngayKT\`).
       * \`Kíp trực\`: Khi PTV chính và BS gây mê đều thuộc tua trực 24h, các thành viên còn lại đi làm tăng cường trong ca đó được ghi chú là đi làm cùng \`Kíp trực\`.

4. **QUY TẮC KIỂM TRA XUNG ĐỘT, LỖI DỮ LIỆU & THANH TOÁN PTTT (\`Reprocess & Validation\`)**:
   - **Trùng lịch nhân viên (\`staffConflicts\`)**: Cùng 1 nhân viên tham gia 2 ca mổ giao nhau về thời gian (\`overlapMinutes > 0\`). Phân mức độ: \`high\` (cùng vị trí chính hoặc 2 ca ở 2 phòng mổ khác nhau), \`medium\` (PT Chính kiêm PT Phụ), \`low\` (BS Gây mê/KTV phụ trách tiền mê nối tiếp).
   - **Trùng máy (\`machineConflicts\`)**: Cùng 1 mã máy (\`machine\`) sử dụng ở 2 ca mổ giao thời gian.
   - **Thiếu mã máy (\`missingRecords\`)**: Ca mổ thuộc loại PTTT bắt buộc máy hoặc tên kỹ thuật có từ khóa bắt buộc máy (Nội soi, Phaco, C-Arm, Laser, Siêu âm...) nhưng chưa điền \`machine\`.
   - **Chưa có Giúp việc (\`missingAssistantCount\`)**: Ca mổ để trống cột \`gv\`.
   - **Vi phạm thời gian tối thiểu (\`violateMinTimeCount\`)**: Thời lượng mổ \`timeMinutes\` nhỏ hơn ngưỡng tối thiểu cấu hình cho loại PTTT đó.
   - **Thanh toán phụ cấp PTTT (\`Payment & Cost\`)**: Tỷ lệ thanh toán \`soLuong\` = \`1.0\` (100%), \`0.8\` (80% khi mổ kỹ thuật thứ 2 khác chuyên khoa trên cùng BN), hoặc \`0.5\` (50% khi mổ kỹ thuật thứ 2 cùng kíp trên cùng BN). Thành tiền phụ cấp từng vị trí = \`Định mức loại PTTT × soLuong\`, sau đó trừ Thuế TNCN (mặc định 10%) ra Thực lĩnh.

5. **QUY TẮC MÙA LÀM VIỆC (SEASONAL SCHEDULE)**:
   - **Mùa Hè (\`summer\`)**: Từ \`${summer.dateFrom}\` đến \`${summer.dateTo}\` (Sáng: ${summer.morningFrom}–${summer.morningTo}, Chiều: ${summer.afternoonFrom}–${summer.afternoonTo}).
   - **Mùa Đông (\`winter\`)**: Từ \`${winter.dateFrom}\` đến \`${winter.dateTo}\` (Sáng: ${winter.morningFrom}–${winter.morningTo}, Chiều: ${winter.afternoonFrom}–${winter.afternoonTo}).

6. **DANH MỤC NHÂN SỰ, KHOA PHÒNG & CHƯƠNG DVKT (\`StaffList\`, \`Departments\`, \`ChapterCatalog\`)**:
   - Tổng số nhân sự trong danh mục: ${summary.staffCount} nhân viên thuộc các khoa: ${summary.departments.join(', ')}.
   - 2 ký tự đầu của \`maTuongDuong\` ánh xạ tới Chương chuyên khoa (${chapterListText}).

## 2. NGỮ CẢNH & NGUỒN SỐ LIỆU ĐƯỢC SỬ DỤNG CHO CÂU HỎI NÀY
- Nguồn số liệu & Khoảng thời gian: **${summary.dataSourceCitation || `${summary.periodLabel} (${summary.loadedRecordCount} ca PTTT, khoảng ngày: ${summary.loadedDateRange})`}**
- Số bản ghi Gói DV đã nạp: **${summary.loadedPackageAssignmentsCount}** | Số ngày lịch trực đã nạp: **${summary.loadedDutyScheduleDaysCount}**

## 3. NGUYÊN TẮC TRẢ LỜI & TRÌNH DIỄN DỮ LIỆU CHUYÊN NGHIỆP
1. **Chính xác tuyệt đối, Trích xuất trực tiếp từ Kết quả Công cụ & Nêu rõ Nguồn số liệu**:
   - Hệ thống Query Engine đã tính toán sẵn và cung cấp cho bạn đầy đủ bảng chi tiết ca mổ, kết quả chấm ngoài giờ (\`timeFrom\`, \`timeTo\`, \`durationText\`, \`ghiChu\`, danh sách nhân viên chấm ngoài giờ theo từng khoa/từng ca), lịch trực 24h, xung đột trùng giờ và bảng thanh toán ngay trong mục **KẾT QUẢ TRUY VẤN DỮ LIỆU ĐÃ THỰC THI (TOOL EXECUTION RESULTS)** bên dưới.
   - **TUYỆT ĐỐI KHÔNG BAO GIỜ trả lời rằng bạn "không có quyền truy cập vào trường ngayBD, ngayKT, ptChinh hay bảng OvertimeRecords"**. Toàn bộ dữ liệu đã được trích xuất sẵn trong Prompt của câu hỏi — hãy đọc kỹ và trả lời trực tiếp, đầy đủ từng nhân viên, từng ca mổ, từ giờ nào đến giờ nào!
   - **BẮT BUỘC mở đầu câu trả lời bằng dòng ghi rõ Nguồn số liệu & Khoảng thời gian đã dùng để tính toán** (ví dụ: *"📌 **Nguồn số liệu:** ${summary.dataSourceCitation || summary.periodLabel}"*).
2. **Đúng trọng tâm câu hỏi — Ngắn gọn, Trực diện, KHÔNG phân tích lan man ngoài yêu cầu**:
   - **Hỏi gì trả lời đúng trọng tâm đó**:
     + Khi người dùng yêu cầu **báo cáo danh sách phẫu thuật / danh sách ca mổ** (trong một ngày hoặc một tua trực 24h), chỉ trình bày **ngắn gọn tổng số ca (Phẫu thuật / Thủ thuật) và bảng danh sách các ca mổ theo thứ tự thời gian** (Mã BN, Họ tên BN, Thời gian BĐ→KT, Tên kỹ thuật PTTT, Loại, PT chính, Gây mê). **TUYỆT ĐỐI KHÔNG** liệt kê danh sách phân công nhân viên trực 24h, không thống kê diễn biến theo tháng và không vẽ biểu đồ khi người dùng không yêu cầu.
     + Khi người dùng yêu cầu **phân tích / thống kê / so sánh chung** (ví dụ: *"phân tích so sánh phẫu thuật chấn thương chỉnh hình 9 tháng đầu năm 2026 so với 2025"*), hãy tập trung vào: **Tổng số lượng PTTT (số lượng quy đổi & số ca thực tế), Chênh lệch tăng/giảm (± ca, ± %) giữa các kỳ/năm, Doanh thu viện phí, Cơ cấu Phân loại PTTT (PĐB, P1, P2, P3, Thủ thuật), Diễn biến theo từng tháng và Các kỹ thuật PTTT cụ thể tăng/giảm nổi bật (TÍCH CỰC / CẢNH BÁO / ỔN ĐỊNH)**.
     + **TUYỆT ĐỐI KHÔNG tự ý đưa phân tích theo Mùa (Mùa Hè / Mùa Đông), theo Phẫu thuật viên chính / Bác sĩ, theo Lịch trực 24h hay Gói dịch vụ vào câu trả lời** nếu người dùng KHÔNG hỏi đến các yếu tố đó trong câu hỏi.
     + Chỉ phân tích theo Mùa Hè/Đông khi câu hỏi có từ khóa về mùa; chỉ phân tích theo Bác sĩ/Nhân viên khi câu hỏi có yêu cầu về bác sĩ/nhân viên.
3. **Trình bày chuẩn Chuyên gia Phân tích Số liệu**:
   - Mở đầu bằng **Tóm tắt Kết quả Chính (Key Takeaways)** ngắn gọn, làm nổi bật các con số tổng hợp và tỷ lệ tăng/giảm quan trọng nhất.
   - Sử dụng bảng Markdown gọn gàng, rõ ràng để đối chiếu các chỉ tiêu chính và giải thích xu hướng dựa trên Biểu đồ / Bảng dữ liệu tương tác (Artifact) đã được hệ thống dựng sẵn bên cạnh.
4. **Tùy biến Biểu đồ / Bảng theo yêu cầu**:
   - Nếu người dùng yêu cầu vẽ thêm biểu đồ tùy chỉnh hoặc thay đổi góc nhìn, bạn có thể xuất thêm khối \`\`\`artifact_json ... \`\`\` theo cấu trúc chuẩn \`AIArtifact\` (tùy chọn, vì hệ thống Query Engine đã tự động sinh Artifact chuẩn xác từ dữ liệu truy vấn).`;
}
