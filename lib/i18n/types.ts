/**
 * Shared dictionary shape. Each locale file must satisfy this type, ensuring
 * keys (and only keys) match across languages. Strings are free.
 */

export interface Dict {
  common: {
    confirm: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    close: string;
    loading: string;
    retry: string;
    today: string;
    yesterday: string;
    appName: string;
    select: string;
    noResults: string;
    errorMsg: string;
    recent: string;
    refresh: string;
    searchWithName: string;
    selfSuffix: string;
    searchPlaceholder: string;
    log: string;
    noData: string;
    prev: string;
    next: string;
    other: string;
  };

  unlock: {
    title: string;
    subtitle: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    submitBtn: string;
    submitLoading: string;
    biometricBtn: string;
    biometricLoading: string;
    biometricFailed: string;
    wrongPassword: string;
    resetVaultBtn: string;
    resetConfirm: string;
    errPasswordRequired: string;
    errVaultEmpty: string;
    toastSuccess: string;
    biometricFailedMsg: string;
    resetVaultToast: string;
    resetVaultError: string;
    initializing: string;
    checkingVault: string;
  };

  connect: {
    title: string;
    subtitle: string;
    urlLabel: string;
    urlPlaceholder: string;
    tokenLabel: string;
    tokenPlaceholder: string;
    createPasswordLabel: string;
    createPasswordPlaceholder: string;
    submitBtn: string;
    submitLoading: string;
    successTauri: string;
    successBrowser: string;
    errMissing: string;
    errPasswordShort: string;
    browserModeSub: string;
  };

  settings: {
    title: string;
    subtitle: string;

    account: {
      section: string;
      notLoggedIn: string;
      logoutBtn: string;
      logoutTitle: string;
    };

    security: {
      section: string;
      autoLockTitle: string;
      autoLockDesc: string;
      autoLockOff: string;
      autoLockOnBlur: string;
      autoLockOnHide: string;
      autoLockMinutes: string;
      autoLockHour: string;
      autoLockToastOff: string;
      autoLockToastOn: string;
      autoLockToastEvent: string;
      bioTitle: string;
      bioChecking: string;
      bioUnavailable: string;
      bioDesc: string;
      bioToastOn: string;
      bioToastOff: string;
      bioConfirmLabel: string;
      bioConfirmPlaceholder: string;
      bioConfirmBtn: string;
      bioConfirmLoading: string;
      bioToggleOnTooltip: string;
      bioToggleFormOpenTooltip: string;
      bioToggleFormClosedTooltip: string;
    };

    language: {
      section: string;
      title: string;
      desc: string;
    };

    reset: {
      btn: string;
      confirmText: string;
      confirmBtn: string;
      loading: string;
      toast: string;
      title: string;
    };

    about: {
      author: string;
    };
  };

  sidebar: {
    calendar: string;
    stats: string;
    team: string;
    favorites: string;
    logTime: string;
    settingsTitle: string;
    logTimeTooltip: string;
  };

  tray: {
    todayLabel: string;
    todayEmpty: string;
    quickLog: string;
    openDashboard: string;
    quit: string;
  };

  errors: {
    network: string;
    badToken: string;
    forbidden: string;
    notFound: string;
    timeout: string;
    badRequest: string;
    validation: string;
    rateLimit: string;
    server: string;
    maintenance: string;
    unknown: string;
    serverError: string;
    clientError: string;
  };

  calendar: {
    title: string;
    loadError: string;
    prevMonth: string;
    nextMonth: string;
    selectMonth: string;
    selectYear: string;
    todayBtn: string;
    expandTooltip: string;
    collapseTooltip: string;
    toggleExpandAria: string;
    refreshBtn: string;
    logTimeBtn: string;
    logTimeTooltip: string;
    missingDays: string;
    missingChipTooltip: string;
    incompleteDays: string;
    incompleteChipTooltip: string;
    snoozeTooltip: string;
    snoozeAria: string;
    totalMonth: string;
    workingDaysCount: string;
    averagePerDay: string;
    loggedDaysCount: string;
    todayLogged: string;
    mon: string;
    tue: string;
    wed: string;
    thu: string;
    fri: string;
    sat: string;
    sun: string;
    loading: string;
    moreCount: string;
    logMoreTooltip: string;
    logMoreAria: string;
    addEntryTooltip: string;
    addEntryAria: string;
    ctxLogTime: string;
    ctxViewDetails: string;
  };

  stats: {
    title: string;
    yearLabel: string;
    halfFirstLabel: string;
    halfSecondLabel: string;
    quarterLabel: string;
    loadError: string;
    periodMonth: string;
    periodQuarter: string;
    periodHalf: string;
    periodYear: string;
    periodCustom: string;
    totalHours: string;
    loggedDays: string;
    fullDays: string;
    averagePerDay: string;
    loading: string;
    noData: string;
    chartByIssue: string;
    chartByProject: string;
    chartByActivity: string;
    cardByIssue: string;
    cardByActivity: string;
    cardByProject: string;
  };

  team: {
    title: string;
    weekLabel: string;
    loadError: string;
    filterLabel: string;
    selectUser: string;
    searchUserPlaceholder: string;
    deselectAll: string;
    noUserFound: string;
    periodWeek: string;
    periodMonth: string;
    memberCount: string;
    workingDays: string;
    targetPerUser: string;
    totalTeamHours: string;
    noData: string;
    tableHeaderUser: string;
    tableHeaderTotal: string;
  };

  favorites: {
    title: string;
    addLabel: string;
    addPlaceholder: string;
    emptyText: string;
    emptyDesc: string;
    limitToast: string;
    pinnedToast: string;
    logTimeTitle: string;
    unpinTitle: string;
    unpinAria: string;
    pinnedHeader: string;
    searchEmptyTip: string;
    pinTooltip: string;
  };

  log: {
    errInvalidHours: string;
    errMissingActivity: string;
    errNoDaysSelected: string;
    toastSuccess: string;
    toastError: string;
    subtitle: string;
    hoursPerDay: string;
    selectActivity: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    progressLogging: string;
    progressCompleteSuccessOnly: string;
    progressCompleteWithErrors: string;
    weekdays: string;
    clearSelection: string;
    selectedDaysCount: string;
    loggedTooltip: string;
    loggedCount: string;
    dayLoggedInfo: string;
    loggingBtn: string;
    submitBtnCount: string;
    submitBtnBulk: string;
    deleteSuccess: string;
    deleteForbidden: string;
    deleteError: string;
    detailSubtitleOne: string;
    detailSubtitleMany: string;
    noIssue: string;
    confirmDeleteHours: string;
    addEntryBtn: string;
    totalLabel: string;
    entrySingle: string;
    entryPlural: string;
  };

  updater: {
    currentVersion: string;
    newVersionTitle: string;
    newVersionPrompt: string;
    updateBtn: string;
    laterBtn: string;
    updateFailed: string;
  };
}
