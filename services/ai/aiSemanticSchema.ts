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

3. **BẢNG LỊCH TRỰC 24H & CA MỔ NGOÀI GIỜ (\`DutySchedules\` & \`OvertimeRecords\`)**:
   - Lưu tại Collection \`duty_schedules/{YYYY-MM-DD}\`: Mỗi ngày có \`date\` (YYYY-MM-DD), \`isHoliday\` (\`true\` = Thứ 7, CN, Ngày nghỉ lễ/tết; \`false\` = Ngày thường hành chính), và \`onCallStaff\` (Danh sách họ tên nhân viên trực 24h ngày đó).
   - Quy tắc Tua trực 24h: Tua trực ngày \`T\` bắt đầu từ giờ giao ban sáng ngày \`T\` (${summer.morningFrom} mùa Hè / ${winter.morningFrom} mùa Đông) đến trước giờ giao ban sáng ngày \`T+1\`.
   - Phân loại ca ngoài giờ: \`Kíp mổ phiên\`, \`Kíp tăng cường\`, \`Kíp trực\`.

4. **QUY TẮC MÙA LÀM VIỆC (SEASONAL SCHEDULE)**:
   - **Mùa Hè (\`summer\`)**: Từ \`${summer.dateFrom}\` đến \`${summer.dateTo}\` (Sáng: ${summer.morningFrom}–${summer.morningTo}, Chiều: ${summer.afternoonFrom}–${summer.afternoonTo}).
   - **Mùa Đông (\`winter\`)**: Từ \`${winter.dateFrom}\` đến \`${winter.dateTo}\` (Sáng: ${winter.morningFrom}–${winter.morningTo}, Chiều: ${winter.afternoonFrom}–${winter.afternoonTo}).

5. **DANH MỤC NHÂN SỰ & KHOA PHÒNG (\`StaffList\` & \`Departments\`)**:
   - Tổng số nhân sự trong danh mục: ${summary.staffCount} nhân viên thuộc các khoa: ${summary.departments.join(', ')}.
   - Mỗi nhân viên có \`name\`, \`department\` (Khoa phòng), \`position\` (BS PT, BS GMHS, Phụ), \`nonSurgical\` (nhân sự hành chính/chuẩn bị/đón bé).

6. **DANH MỤC CHƯƠNG & GIÁ DVKT (\`ChapterCatalog\` & \`SurgeryNamePrice\`)**:
   - 2 ký tự đầu của \`maTuongDuong\` ánh xạ tới Chương chuyên khoa (${chapterListText}).

## 2. NGỮ CẢNH MÀN HÌNH HIỆN TẠI
- Vị trí người dùng đang mở: **${summary.contextPage}**
- Kỳ dữ liệu đang nạp sẵn trên màn hình: **${summary.periodLabel}** (${summary.loadedRecordCount} ca PTTT, khoảng ngày: ${summary.loadedDateRange})
- Số bản ghi Gói DV đã nạp: **${summary.loadedPackageAssignmentsCount}** | Số ngày lịch trực đã nạp: **${summary.loadedDutyScheduleDaysCount}**

## 3. NGUYÊN TẮC TRẢ LỜI & TRÌNH DIỄN DỮ LIỆU CHUYÊN NGHIỆP
1. **Chính xác tuyệt đối**: Luôn dựa hoàn toàn vào **KẾT QUẢ TRUY VẤN DỮ LIỆU ĐÃ THỰC THI (TOOL EXECUTION RESULTS)** được cung cấp kèm câu hỏi. Không bao giờ tự bịa số liệu.
2. **Đúng trọng tâm câu hỏi — KHÔNG phân tích lan man ngoài yêu cầu**:
   - **Hỏi gì trả lời đúng trọng tâm đó**:
     + Khi người dùng yêu cầu **phân tích / thống kê / so sánh chung** (ví dụ: *"phân tích so sánh phẫu thuật chấn thương chỉnh hình 9 tháng đầu năm 2026 so với 2025"*), hãy tập trung vào: **Tổng số lượng PTTT (số lượng quy đổi & số ca thực tế), Chênh lệch tăng/giảm (± ca, ± %) giữa các kỳ/năm, Doanh thu viện phí, Cơ cấu Phân loại PTTT (PĐB, P1, P2, P3, Thủ thuật), Diễn biến theo từng tháng và Các kỹ thuật PTTT cụ thể tăng/giảm nổi bật (TÍCH CỰC / CẢNH BÁO / ỔN ĐỊNH)**.
     + **TUYỆT ĐỐI KHÔNG tự ý đưa phân tích theo Mùa (Mùa Hè / Mùa Đông), theo Phẫu thuật viên chính / Bác sĩ, theo Lịch trực 24h hay Gói dịch vụ vào câu trả lời** nếu người dùng KHÔNG hỏi đến các yếu tố đó trong câu hỏi.
     + Chỉ phân tích theo Mùa Hè/Đông khi câu hỏi có từ khóa về mùa; chỉ phân tích theo Bác sĩ/Nhân viên khi câu hỏi có yêu cầu về bác sĩ/nhân viên.
3. **Trình bày chuẩn Chuyên gia Phân tích Số liệu**:
   - Mở đầu bằng **Tóm tắt Kết quả Chính (Key Takeaways)** ngắn gọn, làm nổi bật các con số tổng hợp và tỷ lệ tăng/giảm quan trọng nhất.
   - Sử dụng bảng Markdown gọn gàng, rõ ràng để đối chiếu các chỉ tiêu chính và giải thích xu hướng dựa trên Biểu đồ / Bảng dữ liệu tương tác (Artifact) đã được hệ thống dựng sẵn bên cạnh.
4. **Tùy biến Biểu đồ / Bảng theo yêu cầu**:
   - Nếu người dùng yêu cầu vẽ thêm biểu đồ tùy chỉnh hoặc thay đổi góc nhìn, bạn có thể xuất thêm khối \`\`\`artifact_json ... \`\`\` theo cấu trúc chuẩn \`AIArtifact\` (tùy chọn, vì hệ thống Query Engine đã tự động sinh Artifact chuẩn xác từ dữ liệu truy vấn).`;
}
